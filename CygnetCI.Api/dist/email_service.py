# email_service.py - Email fetching service using IMAP/POP3

import imaplib
import poplib
import email
from email.header import decode_header
from email.utils import parsedate_to_datetime
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import base64
from cryptography.fernet import Fernet
import os
import re

# Encryption key for storing SMTP/IMAP passwords securely.
# SECURITY: set EMAIL_ENCRYPTION_KEY (32 bytes) in the environment. The hardcoded default
# below is insecure and only exists so the app keeps running if the variable is unset —
# anyone with the source can decrypt passwords protected by it.
_DEFAULT_EMAIL_KEY = 'your-32-byte-key-here-for-fernet!'
ENCRYPTION_KEY = os.environ.get('EMAIL_ENCRYPTION_KEY', _DEFAULT_EMAIL_KEY)
if ENCRYPTION_KEY == _DEFAULT_EMAIL_KEY:
    print("[email_service] WARNING: EMAIL_ENCRYPTION_KEY is not set — using the insecure "
          "default key. Set EMAIL_ENCRYPTION_KEY in the environment for production.")

def get_fernet():
    """Get Fernet cipher for encryption/decryption"""
    key = ENCRYPTION_KEY
    if len(key) < 32:
        key = key.ljust(32, '0')
    elif len(key) > 32:
        key = key[:32]
    return Fernet(base64.urlsafe_b64encode(key.encode()))

def encrypt_password(password: str) -> str:
    """Encrypt password for storage"""
    f = get_fernet()
    return f.encrypt(password.encode()).decode()

def decrypt_password(encrypted_password: str) -> str:
    """Decrypt password for use"""
    f = get_fernet()
    return f.decrypt(encrypted_password.encode()).decode()

def decode_mime_header(header_value: str) -> str:
    """Decode MIME encoded header values"""
    if not header_value:
        return ""

    decoded_parts = []
    for part, encoding in decode_header(header_value):
        if isinstance(part, bytes):
            if encoding:
                try:
                    decoded_parts.append(part.decode(encoding))
                except:
                    decoded_parts.append(part.decode('utf-8', errors='replace'))
            else:
                decoded_parts.append(part.decode('utf-8', errors='replace'))
        else:
            decoded_parts.append(part)

    return ''.join(decoded_parts)

def extract_email_address(from_header: str) -> tuple:
    """Extract sender name and email from From header"""
    if not from_header:
        return "", ""

    # Try to parse "Name <email@example.com>" format
    match = re.match(r'^(.+?)\s*<(.+?)>$', from_header)
    if match:
        name = decode_mime_header(match.group(1).strip().strip('"'))
        email_addr = match.group(2).strip()
        return name, email_addr

    # Just email address
    return "", from_header.strip()

def get_email_body(msg) -> tuple:
    """Extract email body (plain text preferred) and check for attachments"""
    body = ""
    has_attachment = False

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition", ""))

            # Check for attachments
            if "attachment" in content_disposition:
                has_attachment = True
                continue

            # Get text body
            if content_type == "text/plain":
                try:
                    payload = part.get_payload(decode=True)
                    charset = part.get_content_charset() or 'utf-8'
                    body = payload.decode(charset, errors='replace')
                except:
                    body = str(part.get_payload())
            elif content_type == "text/html" and not body:
                try:
                    payload = part.get_payload(decode=True)
                    charset = part.get_content_charset() or 'utf-8'
                    html_body = payload.decode(charset, errors='replace')
                    # Strip HTML tags for preview
                    body = re.sub(r'<[^>]+>', '', html_body)
                    body = re.sub(r'\s+', ' ', body).strip()
                except:
                    pass
    else:
        try:
            payload = msg.get_payload(decode=True)
            charset = msg.get_content_charset() or 'utf-8'
            body = payload.decode(charset, errors='replace')
        except:
            body = str(msg.get_payload())

    return body.strip(), has_attachment

def fetch_emails_imap(
    host: str,
    port: int,
    username: str,
    password: str,
    use_ssl: bool = True,
    folder: str = 'INBOX',
    limit: int = 50,
    since_date: Optional[datetime] = None
) -> List[Dict[str, Any]]:
    """Fetch emails using IMAP protocol"""
    emails = []

    try:
        # Connect to IMAP server
        if use_ssl:
            mail = imaplib.IMAP4_SSL(host, port)
        else:
            mail = imaplib.IMAP4(host, port)

        # Login
        mail.login(username, password)

        # Select folder
        mail.select(folder, readonly=True)

        # Build search criteria
        search_criteria = 'ALL'
        if since_date:
            date_str = since_date.strftime('%d-%b-%Y')
            search_criteria = f'(SINCE {date_str})'

        # Search for emails
        status, messages = mail.search(None, search_criteria)

        if status != 'OK':
            raise Exception("Failed to search emails")

        # Get message IDs (newest first)
        message_ids = messages[0].split()
        message_ids = message_ids[-limit:] if len(message_ids) > limit else message_ids
        message_ids.reverse()  # Newest first

        for msg_id in message_ids:
            try:
                # Fetch email
                status, msg_data = mail.fetch(msg_id, '(RFC822 FLAGS)')

                if status != 'OK':
                    continue

                # Parse email
                raw_email = msg_data[0][1]
                msg = email.message_from_bytes(raw_email)

                # Check if read
                flags = msg_data[0][0].decode() if isinstance(msg_data[0][0], bytes) else str(msg_data[0][0])
                is_read = '\\Seen' in flags

                # Extract headers
                subject = decode_mime_header(msg.get('Subject', '(No Subject)'))
                from_header = decode_mime_header(msg.get('From', ''))
                sender_name, sender_email = extract_email_address(from_header)

                if not sender_name:
                    sender_name = sender_email.split('@')[0] if sender_email else 'Unknown'

                # Parse date
                date_header = msg.get('Date')
                try:
                    received_at = parsedate_to_datetime(date_header) if date_header else datetime.now()
                except:
                    received_at = datetime.now()

                # Get body
                body, has_attachment = get_email_body(msg)
                preview = body[:200] + '...' if len(body) > 200 else body

                # Determine priority based on headers
                priority = 'medium'
                importance = msg.get('Importance', '').lower()
                x_priority = msg.get('X-Priority', '')

                if importance == 'high' or x_priority in ['1', '2']:
                    priority = 'high'
                elif importance == 'low' or x_priority in ['4', '5']:
                    priority = 'low'

                emails.append({
                    'message_id': msg.get('Message-ID', str(msg_id)),
                    'subject': subject,
                    'sender': sender_name,
                    'sender_email': sender_email,
                    'preview': preview,
                    'body': body,
                    'received_at': received_at.isoformat(),
                    'is_read': is_read,
                    'has_attachment': has_attachment,
                    'priority': priority
                })

            except Exception as e:
                print(f"Error parsing email {msg_id}: {e}")
                continue

        mail.close()
        mail.logout()

    except Exception as e:
        raise Exception(f"IMAP Error: {str(e)}")

    return emails

def fetch_emails_pop3(
    host: str,
    port: int,
    username: str,
    password: str,
    use_ssl: bool = True,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """Fetch emails using POP3 protocol"""
    emails = []

    try:
        # Connect to POP3 server
        if use_ssl:
            mail = poplib.POP3_SSL(host, port)
        else:
            mail = poplib.POP3(host, port)

        # Login
        mail.user(username)
        mail.pass_(password)

        # Get number of messages
        num_messages = len(mail.list()[1])

        # Fetch latest emails (newest first)
        start = max(1, num_messages - limit + 1)

        for i in range(num_messages, start - 1, -1):
            try:
                # Fetch email
                response, lines, octets = mail.retr(i)
                raw_email = b'\n'.join(lines)
                msg = email.message_from_bytes(raw_email)

                # Extract headers
                subject = decode_mime_header(msg.get('Subject', '(No Subject)'))
                from_header = decode_mime_header(msg.get('From', ''))
                sender_name, sender_email = extract_email_address(from_header)

                if not sender_name:
                    sender_name = sender_email.split('@')[0] if sender_email else 'Unknown'

                # Parse date
                date_header = msg.get('Date')
                try:
                    received_at = parsedate_to_datetime(date_header) if date_header else datetime.now()
                except:
                    received_at = datetime.now()

                # Get body
                body, has_attachment = get_email_body(msg)
                preview = body[:200] + '...' if len(body) > 200 else body

                # Determine priority
                priority = 'medium'
                importance = msg.get('Importance', '').lower()
                x_priority = msg.get('X-Priority', '')

                if importance == 'high' or x_priority in ['1', '2']:
                    priority = 'high'
                elif importance == 'low' or x_priority in ['4', '5']:
                    priority = 'low'

                emails.append({
                    'message_id': msg.get('Message-ID', str(i)),
                    'subject': subject,
                    'sender': sender_name,
                    'sender_email': sender_email,
                    'preview': preview,
                    'body': body,
                    'received_at': received_at.isoformat(),
                    'is_read': False,  # POP3 doesn't track read status
                    'has_attachment': has_attachment,
                    'priority': priority
                })

            except Exception as e:
                print(f"Error parsing email {i}: {e}")
                continue

        mail.quit()

    except Exception as e:
        raise Exception(f"POP3 Error: {str(e)}")

    return emails

def test_email_connection(
    server_type: str,
    host: str,
    port: int,
    username: str,
    password: str,
    use_ssl: bool = True
) -> Dict[str, Any]:
    """Test email server connection"""
    try:
        if server_type == 'imap':
            if use_ssl:
                mail = imaplib.IMAP4_SSL(host, port)
            else:
                mail = imaplib.IMAP4(host, port)

            mail.login(username, password)

            # Get folder list
            status, folders = mail.list()
            folder_list = []
            if status == 'OK':
                for folder in folders:
                    if isinstance(folder, bytes):
                        folder = folder.decode()
                    # Parse folder name
                    match = re.search(r'"([^"]+)"$|(\S+)$', folder)
                    if match:
                        folder_list.append(match.group(1) or match.group(2))

            mail.logout()

            return {
                'success': True,
                'message': 'Connection successful',
                'folders': folder_list
            }

        elif server_type == 'pop3':
            if use_ssl:
                mail = poplib.POP3_SSL(host, port)
            else:
                mail = poplib.POP3(host, port)

            mail.user(username)
            mail.pass_(password)

            # Get mailbox stats
            num_messages, size = mail.stat()

            mail.quit()

            return {
                'success': True,
                'message': f'Connection successful. {num_messages} messages in mailbox.',
                'folders': ['INBOX']  # POP3 only has inbox
            }
        else:
            return {
                'success': False,
                'message': f'Unsupported server type: {server_type}'
            }

    except Exception as e:
        return {
            'success': False,
            'message': str(e)
        }
