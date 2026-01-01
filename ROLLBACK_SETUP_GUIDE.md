# Rollback Script Management - Setup Guide

## Overview

The Rollback Script Management feature allows you to upload SQL database scripts and analyze them using Claude AI to automatically identify all database objects (tables, stored procedures, functions, views, triggers, indexes, etc.).

## Features

✅ Upload SQL scripts (.sql files)
✅ AI-powered analysis using Claude AI
✅ Automatic detection of database objects:
  - Tables
  - Stored Procedures
  - Functions
  - Views
  - Triggers
  - Indexes
  - User Types
  - Table Types

✅ Store scripts in NFSShared folder
✅ Track upload history and analysis status
✅ Download scripts
✅ Delete scripts

## Setup Instructions

### 1. Configure Claude AI API

Edit `CygnetCI.Api/config.ini` and update the Claude AI section:

```ini
[claude_ai]
# Claude AI API Configuration for Script Analysis
api_url = https://api.anthropic.com/v1/messages
api_key = YOUR_ACTUAL_API_KEY_HERE
model = claude-3-5-sonnet-20241022
max_tokens = 4096
temperature = 0
```

**Important:** Replace `YOUR_ACTUAL_API_KEY_HERE` with your actual Claude AI API key from https://console.anthropic.com/

### 2. Create Database Tables

The database tables will be created automatically when you start the FastAPI server due to this line in `main.py`:

```python
models.Base.metadata.create_all(bind=engine)
```

This creates:
- `rollback_scripts` - Stores uploaded script metadata
- `rollback_database_objects` - Stores identified database objects

**Manual Migration (Optional):**

If you need to run the migration manually:

```bash
cd CygnetCI.Api
python run_rollback_migration.py
```

### 3. Create NFSShared Rollback Folder

The rollback folder is automatically created when you upload the first script. Default location:

```
NFSShared/rollback/
```

You can change this in `config.ini`:

```ini
[paths]
rollback_scripts_folder = rollback
```

### 4. Start the Services

**Start FastAPI Backend:**

```bash
cd CygnetCI.Api
python main.py
```

The API will be available at http://localhost:8000

**Start Next.js Frontend:**

```bash
cd CygnetCI.Web/cygnetci-web
npm run dev
```

The web UI will be available at http://localhost:3000

### 5. Access the Rollback Page

Navigate to: http://localhost:3000/rollback

## Usage

### Uploading a Script

1. Go to the Rollback page
2. Click "Upload New Script"
3. Select a .sql file
4. Optionally add:
   - Description
   - Your name (Uploaded By)
5. Click "Upload Script"

### Analyzing a Script

1. Find the uploaded script in the list
2. Click "Analyze" button
3. Wait for Claude AI to analyze (typically 5-30 seconds depending on script size)
4. Status will change from "pending" → "analyzing" → "completed"

### Viewing Results

1. Click "View Details" on a completed analysis
2. See all identified database objects grouped by:
   - Database name
   - Object type (tables, stored procedures, functions, etc.)

### Downloading Scripts

Click the download icon (⬇) next to any script to download the original SQL file.

### Deleting Scripts

Click the trash icon (🗑) next to any script to delete it (both the file and database records).

## API Endpoints

### Upload Script
```
POST /rollback/upload
Content-Type: multipart/form-data

Form Data:
- file: SQL file
- description (optional): Script description
- uploaded_by (optional): Uploader name
```

### Analyze Script
```
POST /rollback/{script_id}/analyze
```

### Get All Scripts
```
GET /rollback/scripts
```

### Get Script Details
```
GET /rollback/{script_id}
```

### Download Script
```
GET /rollback/{script_id}/download
```

### Delete Script
```
DELETE /rollback/{script_id}
```

## Example Response Format

When a script is analyzed, the AI returns database objects in this format:

```json
{
  "DbDetails": [
    {
      "DbName": "MyDatabase",
      "TableNames": ["Users", "Orders", "Products"],
      "SpNames": ["sp_GetUserOrders", "sp_CreateOrder"],
      "FunctionNames": ["fn_CalculateTotal"],
      "UserTypes": ["EmailType"],
      "TableTypes": ["OrderLineItemType"],
      "Views": ["vw_CustomerOrders"],
      "Triggers": ["trg_AuditLog"],
      "Indexes": ["idx_Orders_CustomerId"]
    }
  ]
}
```

## Troubleshooting

### API Key Error

If you see authentication errors, verify your Claude AI API key in `config.ini`.

### File Upload Error

- Ensure `.sql` extension is allowed in `config.ini`
- Check NFSShared folder permissions
- Verify file size is within limits

### Analysis Timeout

- Large scripts (>10,000 lines) may take longer
- Increase `max_tokens` in config.ini if needed
- Check Claude AI API rate limits

### Database Connection Error

- Verify PostgreSQL is running
- Check database credentials in `config.ini`
- Ensure database exists

## File Structure

```
CygnetCI/
├── CygnetCI.Api/
│   ├── config.ini                          # Configuration (UPDATE API KEY HERE!)
│   ├── models.py                           # Database models (RollbackScript, RollbackDatabaseObject)
│   ├── main.py                             # API endpoints (/rollback/*)
│   ├── claude_service.py                   # Claude AI integration
│   └── run_rollback_migration.py           # Database migration script
├── CygnetCI.Web/cygnetci-web/
│   └── src/app/rollback/
│       └── page.tsx                        # Rollback UI page
└── NFSShared/
    └── rollback/                           # Uploaded scripts stored here
```

## Security Notes

⚠️ **Important Security Considerations:**

1. **API Key Security**: Never commit your Claude AI API key to version control
2. **File Validation**: Only .sql files are accepted by default
3. **Authentication**: Consider adding user authentication to the rollback endpoints
4. **File Size Limits**: Configure appropriate limits in `config.ini`
5. **SQL Injection**: Scripts are analyzed but not executed - always review before running

## Cost Considerations

- Each script analysis makes one API call to Claude AI
- Costs vary based on script size
- Model: Claude 3.5 Sonnet (pricing: ~$3 per million tokens)
- Typical script (1000 lines) ≈ 2,000-4,000 tokens ≈ $0.01-0.02 per analysis

## Next Steps

1. Update your Claude AI API key in `config.ini`
2. Start the services
3. Upload a test SQL script
4. Click "Analyze" to see AI-powered object detection in action!

For more information, visit: https://docs.anthropic.com/claude/reference/getting-started-with-the-api
