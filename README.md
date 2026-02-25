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

- Next.js 16 with App Router
- TypeScript
- Tailwind CSS
- Supabase (Auth + Database)
- Lucide React (icons)

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Supabase project

### Installation

```bash
npm install
```

### Configuration

1. Create a Supabase project at https://supabase.com
2. Create the required tables (see Database Setup below)
3. Copy `.env.local` and fill in your Supabase credentials:

```bash
cp supabase.env.example .env.local
```

Edit `.env.local` with your values:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Database Setup

Run the following SQL in your Supabase SQL Editor to create the required tables:

```sql
-- Dev Admins (users who can access the console)
CREATE TABLE public.dev_admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.dev_admins ENABLE ROW LEVEL SECURITY;

-- Policy: allow access only to authenticated users who are in this table
CREATE POLICY "Admins can read" ON public.dev_admins
  FOR SELECT USING (auth.uid() = user_id);

-- Dev Cards (KPI definitions)
CREATE TABLE public.dev_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_key TEXT NOT NULL UNIQUE,
  card_type TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  icon TEXT,
  sort_order INT DEFAULT 0,
  is_enabled BOOLEAN DEFAULT true,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dev Card Values (KPI values)
CREATE TABLE public.dev_card_values (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_key TEXT NOT NULL,
  value_num NUMERIC,
  value_text TEXT,
  unit TEXT,
  delta_num NUMERIC,
  delta_text TEXT,
  delta_direction TEXT,
  status TEXT,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dev Feed Items (jobs, errors, etc.)
CREATE TABLE public.dev_feed_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  feed_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS policies for reading dev_cards, dev_card_values, dev_feed_items
-- (adjust based on your security requirements)
```

### Add Admin User

Insert your admin user into `public.dev_admins`:

```sql
INSERT INTO public.dev_admins (user_id, name, email)
VALUES ('your-supabase-user-id', 'Your Name', 'your@email.com');
```

To get your Supabase user ID, check the Authentication > Users table in Supabase dashboard.

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

The app uses Supabase Auth for secure login.

- **Login**: Use your Supabase Auth credentials
- **Access**: Only users in `public.dev_admins` can access the console
- **Logout**: Click the logout button in Settings

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
│   ├── supabaseClient.ts # Supabase client
│   ├── toast.tsx         # Toast notifications
│   └── data/             # Data layer
│       ├── index.ts       # Data exports
│       └── devConsole.ts  # Dev console queries
└── mocks/                # Mock data (legacy)
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (from Settings > API) |

## Deployment

### Vercel (Recommended)

1. Push your code to a GitHub repository
2. Import the project in Vercel
3. Add the environment variables in Vercel project settings
4. Deploy with default settings

### Manual Build

```bash
npm run build
npm run start
```

## License

MIT
