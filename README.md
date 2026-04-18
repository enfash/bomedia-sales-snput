# BOMedia Sales & Expense System

A modern, offline-first Progressive Web App (PWA) built specifically for BOMedia to track sales, expenses, and material inventory. The system seamlessly synchronizes with Google Sheets as its primary database, allowing for powerful spreadsheet analytics while providing a fast, app-like experience for staff.

## 🚀 Key Features

*   **Offline-First Architecture**: Cashiers can log sales and expenses even when the internet is entirely disconnected. Logs are securely cached locally and automatically synced in the background when connectivity is restored.
*   **Dual Dashboard System**:
    *   **Admin Dashboard **: Deep analytics, profit/loss tracking, staff management, and inventory auditing.
    *   **Cashier Portal (`/cashier`)**: A streamlined, fast interface for logging daily sales, expenses, and uploading receipts directly from a phone camera.
*   **Dynamic Inventory Auditing**: Uses area-based tracking (Sqft) for materials (SAV, Flex, Blockout, etc.). The system writes direct Google Sheets formulas to maintain a transparent, undeniable audit trail of all manual adjustments and sales decrements.
*   **Automated WhatsApp Reminders**: Admins can send pre-formatted WhatsApp messages to clients for outstanding balances with a single click.
*   **Google Drive Integration**: Receipt photos are automatically compressed and uploaded to a dedicated Google Drive folder, keeping the Google Sheet clean and lightweight.

## 🛠 Tech Stack

*   **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
*   **Language**: TypeScript
*   **Styling**: Tailwind CSS & [shadcn/ui](https://ui.shadcn.com/)
*   **State Management**: Zustand (with Persist middleware for offline storage)
*   **Database**: Google Sheets API (via `google-spreadsheet`)
*   **Storage**: Google Drive API
*   **PWA Support**: Built-in Service Workers for offline caching and home-screen installation.

## ⚙️ Environment Variables

To run this project locally or deploy it, you must configure the following environment variables. Create a `.env.local` file in the root directory:

```env
# Google Service Account Credentials
GOOGLE_CLIENT_EMAIL="your-service-account@your-project.iam.gserviceaccount.com"
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Key_Here...\n-----END PRIVATE KEY-----\n"

# The ID of your target Google Spreadsheet (from the URL)
GOOGLE_SHEET_ID="your_spreadsheet_id_here"

# Admin Authentication
ADMIN_EMAIL="admin@bomedia.com"
ADMIN_PASSWORD="your_secure_password"
```

## 🚀 Getting Started Locally

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Run the Development Server:**
    ```bash
    npm run dev
    ```
3.  **Open the App:** Navigate to `http://localhost:3000` in your browser.

## 📦 Deployment (Vercel)

This project is optimized for deployment on [Vercel](https://vercel.com).
1. Push your code to a GitHub repository.
2. Import the project into Vercel.
3. Add all variables from your `.env.local` to the Vercel **Environment Variables** settings.
    *   *Note: Ensure the `GOOGLE_PRIVATE_KEY` is copied exactly as it appears, including the `\n` characters and the `BEGIN/END` blocks.*
4. Deploy!

## 🔐 Security Notes
This application uses Next.js `14.2.35` to protect against known React Server Components vulnerabilities (CVE-2025-67779). Always ensure dependencies are kept up-to-date.
