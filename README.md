# Lavika Control

Premium operational console for managing your platform.

## Features

- **Dashboard**: Real-time KPIs and system status monitoring
- **Analytics**: User growth, revenue forecasts, and content metrics
- **User Management**: View and manage platform users
- **Sessions**: Track user login sessions and activity
- **Jobs**: Manage and trigger background jobs
- **Job Runs**: Monitor job execution history and logs
- **Errors**: View and investigate system errors
- **Settings**: Configure integrations and feature flags

## Tech Stack

- Next.js 14+ with App Router
- TypeScript
- Tailwind CSS
- Lucide React (icons)

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
```

### Production

```bash
npm start
```

## Authentication

This is a demo application with placeholder authentication.

- **Login**: Use any email and password to sign in
- **Session**: Stored in localStorage for demo purposes
- **Logout**: Click the logout button in the topbar

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth route group
│   │   └── login/         # Login page
│   └── (console)/         # Console route group (protected)
│       ├── dashboard/     # Dashboard
│       ├── analytics/     # Analytics
│       ├── users/         # User management
│       ├── sessions/      # Session tracking
│       ├── jobs/          # Job management
│       ├── errors/        # Error tracking
│       └── settings/      # Settings
├── components/            # Reusable UI components
├── lib/
│   ├── auth.tsx          # Authentication context
│   ├── toast.tsx         # Toast notifications
│   └── data/             # Data layer adapter
│       └── index.ts
└── mocks/                # Mock data for demo
```

## Deployment

### Vercel (Recommended)

1. Push your code to a GitHub repository
2. Import the project in Vercel
3. Deploy with default settings

### Manual Build

```bash
npm run build
npm run start
```

## Environment Variables

No environment variables are required for the demo. The application uses mock data.

## License

MIT
