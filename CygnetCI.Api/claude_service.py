# Claude AI service for analyzing database scripts
# Updated: Using official Anthropic SDK

import json
from configparser import ConfigParser
from typing import Dict, Any
from anthropic import Anthropic

class ClaudeAIService:
    def __init__(self):
        self.config = self._load_config()
        self.api_key = self.config.get('claude_ai', 'api_key')
        self.model = self.config.get('claude_ai', 'model')
        self.max_tokens = self.config.getint('claude_ai', 'max_tokens')
        self.temperature = self.config.getfloat('claude_ai', 'temperature')
        self.client = Anthropic(api_key=self.api_key)

    def _load_config(self) -> ConfigParser:
        config = ConfigParser()
        config.read('config.ini')
        return config

    async def analyze_database_script(self, script_content: str) -> Dict[str, Any]:
        """
        Analyze a database script using Claude AI to identify database objects.

        Args:
            script_content: The SQL script content to analyze

        Returns:
            Dictionary with database objects identified
        """
        prompt = f"""Analyze the following SQL database script and identify ONLY the database objects that are being CREATED, ALTERED, or DROPPED at the TOP LEVEL of the script.

CRITICAL RULES:
1. IGNORE all DDL statements that appear INSIDE function bodies, procedure bodies, or any block between BEGIN...END or $BODY$...$BODY$ or $$...$$
2. IGNORE temporary tables (CREATE TEMP TABLE, CREATE TEMPORARY TABLE) - these are always inside functions
3. ONLY extract object names from TOP-LEVEL DDL statements (not nested inside functions/procedures)
4. Do NOT include table names from SELECT, INSERT, UPDATE, DELETE, JOIN statements

Return a JSON response in the following exact format:
{{
  "DbDetails": [
    {{
      "DbName": "database_name_or_empty_if_not_specified",
      "TableNames": ["table1", "table2"],
      "SpNames": ["stored_procedure1", "stored_procedure2"],
      "FunctionNames": ["function1", "function2"],
      "UserTypes": ["user_type1", "user_type2"],
      "TableTypes": ["table_type1", "table_type2"],
      "Views": ["view1", "view2"],
      "Triggers": ["trigger1", "trigger2"],
      "Indexes": ["index1", "index2"]
    }}
  ]
}}

EXTRACTION RULES:
1. Extract database name from USE statements or leave empty
2. Tables: ONLY from top-level CREATE TABLE, ALTER TABLE, DROP TABLE (NOT inside functions)
3. Stored Procedures: From CREATE PROCEDURE, ALTER PROCEDURE, DROP PROCEDURE at top level
4. Functions: From CREATE FUNCTION, ALTER FUNCTION, DROP FUNCTION at top level
5. Views: From CREATE VIEW, ALTER VIEW, DROP VIEW at top level
6. Triggers: From CREATE TRIGGER, ALTER TRIGGER, DROP TRIGGER at top level
7. Indexes: From CREATE INDEX, DROP INDEX at top level
8. User Types: From CREATE TYPE at top level (excluding table types)
9. Table Types: From CREATE TYPE ... AS TABLE at top level

IMPORTANT - What to EXCLUDE:
❌ Any CREATE/DROP TABLE inside a function body (between BEGIN...END or $BODY$...$BODY$)
❌ Temporary tables (CREATE TEMP TABLE, CREATE TEMPORARY TABLE)
❌ Tables in SELECT, INSERT, UPDATE, DELETE, JOIN statements
❌ Tables referenced in WHERE clauses or function parameters
❌ Any DDL nested inside CREATE FUNCTION or CREATE PROCEDURE blocks

EXAMPLES from a real script:
✅ "ALTER TABLE einvoice.DocumentStatus ADD COLUMN" → Include "einvoice.DocumentStatus"
✅ "DROP FUNCTION IF EXISTS api.InsertCallback" → Include "api.InsertCallback" in FunctionNames
✅ "CREATE OR REPLACE FUNCTION einvoice.UpdateEsalErrors" → Include "einvoice.UpdateEsalErrors" in FunctionNames
❌ "DROP TABLE IF EXISTS TempEInvoiceDocumentIds" (inside function body) → DO NOT include
❌ "CREATE TEMP TABLE TempEInvoiceStatusDetails" (inside function body) → DO NOT include
❌ "UPDATE einvoice.DocumentStatus" (inside function body) → DO NOT include table
❌ "FROM einvoice.Documents" (inside function SELECT) → DO NOT include table
❌ "INSERT INTO einvoice.DocumentSignedDetails" (inside function) → DO NOT include table

SQL Script:
{script_content}"""

        print(f"[Claude AI Debug] Model: {self.model}")
        print(f"[Claude AI Debug] Max tokens: {self.max_tokens}")
        print(f"[Claude AI Debug] Temperature: {self.temperature}")

        try:
            # Use the official Anthropic SDK
            print(f"[Claude AI Debug] Sending request to Anthropic API...")
            print(f"[Claude AI Debug] API Key (first 20 chars): {self.api_key[:20]}...")

            message = self.client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            )

            print(f"[Claude AI Debug] Response received successfully")
            print(f"[Claude AI Debug] Response ID: {message.id}")
            print(f"[Claude AI Debug] Response model: {message.model}")
            print(f"[Claude AI Debug] Response type: {message.content[0].type if message.content else 'No content'}")

            # Extract the text content from Claude's response
            if message.content and len(message.content) > 0:
                text_content = message.content[0].text
                print(f"[Claude AI Debug] Response length: {len(text_content)} characters")
                print(f"[Claude AI Debug] Response preview: {text_content[:200]}...")

                # Parse the JSON from the response
                # Remove any markdown code blocks if present
                text_content = text_content.strip()
                if text_content.startswith("```json"):
                    text_content = text_content[7:]
                if text_content.startswith("```"):
                    text_content = text_content[3:]
                if text_content.endswith("```"):
                    text_content = text_content[:-3]
                text_content = text_content.strip()

                print(f"[Claude AI Debug] Parsing JSON response...")

                # Try to find JSON object boundaries
                # Look for the first { and last }
                start_idx = text_content.find('{')
                if start_idx == -1:
                    raise Exception("No JSON object found in response")

                # Find the matching closing brace
                brace_count = 0
                end_idx = -1
                for i in range(start_idx, len(text_content)):
                    if text_content[i] == '{':
                        brace_count += 1
                    elif text_content[i] == '}':
                        brace_count -= 1
                        if brace_count == 0:
                            end_idx = i + 1
                            break

                if end_idx == -1:
                    raise Exception("Malformed JSON object in response")

                # Extract just the JSON part
                json_text = text_content[start_idx:end_idx]
                print(f"[Claude AI Debug] Extracted JSON length: {len(json_text)} characters")

                analysis_result = json.loads(json_text)
                print(f"[Claude AI Debug] Successfully parsed {len(analysis_result.get('DbDetails', []))} database(s)")
                return analysis_result
            else:
                raise Exception("No content in Claude AI response")

        except json.JSONDecodeError as e:
            print(f"[Claude AI Debug] JSON parse error: {str(e)}")
            print(f"[Claude AI Debug] Text content that failed to parse: {text_content}")
            raise Exception(f"Failed to parse Claude AI response as JSON: {str(e)}")
        except Exception as e:
            print(f"[Claude AI Debug] Full error type: {type(e).__name__}")
            print(f"[Claude AI Debug] Full error message: {str(e)}")
            # Print more details if it's an Anthropic API error
            if hasattr(e, 'status_code'):
                print(f"[Claude AI Debug] HTTP Status Code: {e.status_code}")
            if hasattr(e, 'response'):
                print(f"[Claude AI Debug] Response body: {e.response}")
            if hasattr(e, '__dict__'):
                print(f"[Claude AI Debug] Error attributes: {e.__dict__}")
            raise Exception(f"Error analyzing script with Claude AI: {str(e)}")
