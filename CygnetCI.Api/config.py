# config.py - Configuration Management for CygnetCI

import configparser
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


class Config:
    """Configuration manager for CygnetCI"""

    def __init__(self, config_file='config.ini'):
        self.config_file = config_file
        self.config = configparser.ConfigParser()

        # Load config file
        if not os.path.exists(config_file):
            raise FileNotFoundError(f"Configuration file '{config_file}' not found")

        self.config.read(config_file)

        # Validate and create necessary directories
        self._validate_and_setup()

    def _validate_and_setup(self):
        """Validate configuration and create necessary directories"""
        # Ensure NFS shared root exists
        nfs_root = self.get_nfs_shared_root()
        if not os.path.exists(nfs_root):
            os.makedirs(nfs_root)
            logger.info("Created NFS shared root directory: %s", nfs_root)

        # Create scripts and artifacts folders
        scripts_path = os.path.join(nfs_root, self.get_scripts_folder())
        artifacts_path = os.path.join(nfs_root, self.get_artifacts_folder())

        for path in [scripts_path, artifacts_path]:
            if not os.path.exists(path):
                os.makedirs(path)
                logger.info("Created directory: %s", path)

    # Database Configuration
    def get_database_url(self):
        """Get SQLAlchemy database URL"""
        host = self.config.get('database', 'host')
        port = self.config.get('database', 'port')
        database = self.config.get('database', 'database')
        username = self.config.get('database', 'username')
        password = self.config.get('database', 'password')

        return f"postgresql://{username}:{password}@{host}:{port}/{database}"

    def get_db_host(self):
        return self.config.get('database', 'host')

    def get_db_port(self):
        return self.config.getint('database', 'port')

    def get_db_name(self):
        return self.config.get('database', 'database')

    def get_db_username(self):
        return self.config.get('database', 'username')

    def get_db_password(self):
        return self.config.get('database', 'password')

    # Path Configuration
    def get_nfs_shared_root(self):
        """Get NFS shared root path"""
        return self.config.get('paths', 'nfs_shared_root')

    def get_scripts_folder(self):
        """Get scripts folder name"""
        return self.config.get('paths', 'scripts_folder')

    def get_artifacts_folder(self):
        """Get artifacts folder name"""
        return self.config.get('paths', 'artifacts_folder')

    def get_scripts_path(self):
        """Get full path to scripts folder"""
        return os.path.join(self.get_nfs_shared_root(), self.get_scripts_folder())

    def get_artifacts_path(self):
        """Get full path to artifacts folder"""
        return os.path.join(self.get_nfs_shared_root(), self.get_artifacts_folder())

    def get_file_path(self, file_type, version):
        """Get full path for a file type and version"""
        if file_type == 'script':
            base_path = self.get_scripts_path()
        elif file_type == 'artifact':
            base_path = self.get_artifacts_path()
        else:
            raise ValueError(f"Invalid file type: {file_type}")

        return os.path.join(base_path, version)

    # Server Configuration
    def get_server_host(self):
        return self.config.get('server', 'host')

    def get_server_port(self):
        return self.config.getint('server', 'port')

    def get_server_reload(self):
        return self.config.getboolean('server', 'reload')

    def get_debug_mode(self):
        return self.config.getboolean('server', 'debug')

    # CORS Configuration
    def get_allowed_origins(self):
        """Get list of allowed CORS origins"""
        origins = self.config.get('cors', 'allowed_origins')
        return [origin.strip() for origin in origins.split(',')]

    def get_allow_credentials(self):
        return self.config.getboolean('cors', 'allow_credentials')

    # File Transfer Configuration
    def get_max_file_size_mb(self):
        return self.config.getint('file_transfer', 'max_file_size_mb')

    def get_max_file_size_bytes(self):
        return self.get_max_file_size_mb() * 1024 * 1024

    def get_allowed_script_extensions(self):
        """Get list of allowed script file extensions"""
        extensions = self.config.get('file_transfer', 'allowed_script_extensions')
        return [ext.strip() for ext in extensions.split(',')]

    def get_allowed_artifact_extensions(self):
        """Get list of allowed artifact file extensions"""
        extensions = self.config.get('file_transfer', 'allowed_artifact_extensions')
        return [ext.strip() for ext in extensions.split(',')]

    def should_calculate_checksum(self):
        return self.config.getboolean('file_transfer', 'calculate_checksum')

    def validate_file_extension(self, filename, file_type):
        """Validate if file extension is allowed for the given file type"""
        file_ext = os.path.splitext(filename)[1].lower()

        if file_type == 'script':
            allowed_extensions = self.get_allowed_script_extensions()
        elif file_type == 'artifact':
            allowed_extensions = self.get_allowed_artifact_extensions()
        else:
            return False

        return file_ext in allowed_extensions

    # RabbitMQ Configuration (used to publish outbound email jobs)
    def get_rabbitmq(self):
        section = 'rabbitmq'
        has = self.config.has_section(section)

        def g(opt, default):
            return self.config.get(section, opt, fallback=default) if has else default

        return {
            'enabled': g('enabled', 'true').strip().lower() == 'true',
            'host': g('host', 'localhost'),
            'port': int(g('port', '5672')),
            'vhost': g('vhost', '/'),
            'username': g('username', 'guest'),
            'password': g('password', 'guest'),
            'exchange': g('exchange', 'cygnetci.email'),
            'queue': g('queue', 'email.send'),
            'dlq': g('dlq', 'email.send.dlq'),
            'routing_key': g('routing_key', 'email.send'),
        }

    # Claude AI Configuration (system-wide key, used for rollback script analysis;
    # per-customer keys for the ticket AI assistant are stored encrypted in the DB)
    def get_claude_api_key(self):
        return self.config.get('claude_ai', 'api_key')

    def get_claude_model(self):
        return self.config.get('claude_ai', 'model')

    def get_claude_max_tokens(self):
        return self.config.getint('claude_ai', 'max_tokens')

    def get_claude_temperature(self):
        return self.config.getfloat('claude_ai', 'temperature')

    # Utility Methods
    def print_config(self):
        """Log a summary of the loaded configuration at startup (secrets redacted)."""
        logger.info("CygnetCI Configuration")
        logger.info("[Database] Host: %s:%s  Database: %s  Username: %s  Password: ****** (redacted)",
                    self.get_db_host(), self.get_db_port(), self.get_db_name(), self.get_db_username())
        logger.info("[Paths] NFS Root: %s  Scripts: %s  Artifacts: %s",
                    self.get_nfs_shared_root(), self.get_scripts_path(), self.get_artifacts_path())
        logger.info("[Server] Host: %s  Port: %s  Reload: %s  Debug: %s",
                    self.get_server_host(), self.get_server_port(), self.get_server_reload(), self.get_debug_mode())
        logger.info("[CORS] Allowed Origins: %s", ", ".join(self.get_allowed_origins()))
        logger.info("[File Transfer] Max File Size: %s MB  Script Extensions: %s  Artifact Extensions: %s",
                    self.get_max_file_size_mb(),
                    ", ".join(self.get_allowed_script_extensions()),
                    ", ".join(self.get_allowed_artifact_extensions()))


# Global configuration instance
try:
    app_config = Config()
except FileNotFoundError as e:
    logger.error("%s", e)
    logger.error("Please create a config.ini file in the application directory")
    raise
