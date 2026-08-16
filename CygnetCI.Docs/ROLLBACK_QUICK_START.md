# Rollback Feature - Quick Start Guide

## ⚡ Quick Setup (5 Minutes)

### Step 1: Install Required Package ✅
```bash
cd CygnetCI.Api
pip install httpx
```

### Step 2: Add Your Claude AI API Key
Edit `CygnetCI.Api/config.ini` line 40:

```ini
[claude_ai]
api_key = sk-ant-api03-xxxxx  # Replace with your actual API key
```

Get your API key from: https://console.anthropic.com/settings/keys

### Step 3: Start the Services

**Terminal 1 - Start FastAPI:**
```bash
cd CygnetCI.Api
python main.py
```

Wait for: `Application startup complete.`

**Terminal 2 - Start Next.js:**
```bash
cd CygnetCI.Web/cygnetci-web
npm run dev
```

### Step 4: Access Rollback Page
Open browser: http://localhost:3000/rollback

## 🎯 Quick Test

1. **Upload a Test SQL Script:**
   - Click "Upload New Script"
   - Select any `.sql` file
   - Click "Upload Script"

2. **Analyze It:**
   - Find the uploaded script in the table
   - Click "Analyze" button
   - Wait 10-30 seconds

3. **View Results:**
   - Click "View Details"
   - See all detected database objects!

## 📝 Example Test SQL Script

Create a file `test_script.sql` to test:

```sql
USE TestDatabase;

-- Create table
CREATE TABLE Users (
    UserId INT PRIMARY KEY,
    Username VARCHAR(50),
    Email VARCHAR(100)
);

-- Create stored procedure
CREATE PROCEDURE sp_GetUserByEmail
    @Email VARCHAR(100)
AS
BEGIN
    SELECT * FROM Users WHERE Email = @Email;
END;

-- Create function
CREATE FUNCTION fn_GetUserCount()
RETURNS INT
AS
BEGIN
    RETURN (SELECT COUNT(*) FROM Users);
END;

-- Create view
CREATE VIEW vw_ActiveUsers AS
SELECT UserId, Username FROM Users;

-- Create index
CREATE INDEX idx_Users_Email ON Users(Email);
```

Upload this script and click "Analyze" - you should see:
- Database: TestDatabase
- Tables: Users
- Stored Procedures: sp_GetUserByEmail
- Functions: fn_GetUserCount
- Views: vw_ActiveUsers
- Indexes: idx_Users_Email

## 🔧 Troubleshooting

### Error: "No module named 'httpx'"
```bash
pip install httpx
```

### Error: "API key error" or "401 Unauthorized"
- Check your API key in `config.ini`
- Ensure it starts with `sk-ant-api03-`
- Verify it's valid at https://console.anthropic.com/

### Error: "Database connection failed"
- The tables will be created automatically when FastAPI starts
- If migration fails, the app will still work using SQLAlchemy

### Script uploads but analysis fails
- Check the FastAPI console for error messages
- Verify your Claude AI API key is correct
- Check your internet connection
- Ensure you have API credits available

## 📊 Features

✅ **Upload** - .sql files up to 500MB
✅ **Analyze** - AI detects all database objects
✅ **View** - See all identified objects by type
✅ **Download** - Get the original script file
✅ **Delete** - Remove scripts and their analysis

## 🔒 Security Notes

⚠️ **IMPORTANT:**
- Never commit your API key to git
- Add `config.ini` to `.gitignore` if not already
- Scripts are stored but NOT executed
- Always review scripts before running them in production

## 💰 Cost Estimate

- Small script (100 lines): ~$0.001
- Medium script (1000 lines): ~$0.01
- Large script (10000 lines): ~$0.10

Claude 3.5 Sonnet pricing: ~$3 per million input tokens

## 📚 Full Documentation

See [ROLLBACK_SETUP_GUIDE.md](ROLLBACK_SETUP_GUIDE.md) for complete details.

## 🎉 You're Ready!

The rollback feature is now fully operational. Start uploading and analyzing your SQL scripts!
