# VoiceCamera

A modern, feature-rich web application built with React + TypeScript + Vite.

## 🚀 Features

### Authentication
- **Google Sign-in** - Secure authentication with Google OAuth
- **Passwordless Authentication** - Email magic links
- **User Profiles** - Complete user management system

### Analytics
- **PostHog Integration** - Real-time analytics and user behavior tracking
- **Event Tracking** - Track user interactions and custom events
- **Page View Analytics** - Monitor page performance

### Payments
- **Stripe Integration** - Seamless payment processing
- **Subscription Management** - Recurring billing and subscriptions
- **Checkout Experience** - Smooth, secure checkout flow

### Email
- **Resend Integration** - Beautiful email templates
- **Email Verification** - Verify user emails
- **Password Reset** - Secure password recovery
- **Transactional Emails** - Welcome, notifications, and more

### Database
- **Supabase Integration** - PostgreSQL database with real-time subscriptions
- **Storage** - Cloud storage for user files
- **Auth Helpers** - Simplified authentication methods

### Deployment
- **Vercel Integration** - One-click deployment
- **Custom Domain** - Namecheap integration
- **Edge Functions** - Serverless backend functions

## 🛠️ Tech Stack

- **React 19** - Modern UI library
- **TypeScript** - Type safety
- **Vite** - Fast build tool
- **Supabase** - Backend as a Service
- **Stripe** - Payment processing
- **Resend** - Email delivery
- **PostHog** - Analytics
- **Google OAuth** - Authentication

## 📦 Installation

1. **Clone the repository**
   ```bash
   cd /Users/rafael/Documents/R129/1stPro
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your API keys and configuration.

## 🔧 Configuration

### Environment Variables

```env
# Supabase
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# Google Auth
VITE_GOOGLE_CLIENT_ID=your-google-client-id

# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
STRIPE_SECRET_KEY=your-stripe-secret-key

# Resend
RESEND_API_KEY=your-resend-api-key

# PostHog
VITE_POSTHOG_KEY=your-posthog-key
VITE_POSTHOG_HOST=https://app.posthog.com

# Application
VITE_APP_NAME=1stPro
VITE_APP_URL=http://localhost:5173
```

## 🚀 Development

**Start development server:**
```bash
npm run dev
```

**Build for production:**
```bash
npm run build
```

**Preview production build:**
```bash
npm run preview
```

**Run tests:**
```bash
npm run test
```

## 📁 Project Structure

```
1stPro/
├── src/
│   ├── components/          # React components
│   ├── pages/              # Page components
│   ├── utils/              # Utility functions
│   │   ├── analytics.ts    # PostHog integration
│   │   ├── env.ts         # Environment variables
│   │   ├── resend.ts      # Resend integration
│   │   ├── stripe.ts      # Stripe integration
│   │   └── supabase.ts    # Supabase integration
│   ├── hooks/             # Custom React hooks
│   ├── types/             # TypeScript definitions
│   └── App.tsx           # Main app component
├── api/                   # Vercel Edge Functions
├── public/                # Static assets
├── index.html             # Entry point
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite configuration
└── vercel.json           # Vercel deployment configuration
```

## 🎯 Features Overview

### Google Sign-in
- Secure authentication with Google OAuth
- One-click login
- User profile management

### Analytics Dashboard
- Real-time user behavior tracking
- Custom event tracking
- Page view analytics

### Payment System
- Secure Stripe integration
- Subscription management
- Checkout flow

### Email System
- Beautiful email templates
- Email verification
- Password reset
- Transactional emails

### Database
- Real-time data synchronization
- Cloud storage
- User management

## 🔒 Security

- Google OAuth 2.0 for secure authentication
- Stripe for secure payment processing
- Supabase RLS (Row Level Security)
- Environment variables for configuration

## 📱 Responsive Design

- Mobile-first approach
- Responsive grid system
- Touch-friendly interface
- Dark mode support

## 🌍 Deployment

**Vercel Deployment:**
```bash
vercel login
vercel
```

**Custom Domain with Namecheap:**
1. Configure DNS settings in Namecheap
2. Add domain to Vercel
3. Verify ownership
4. Deploy!

## 📈 Performance

- Vite for fast builds and hot module replacement

## 📄 License

This project is licensed under the MIT License.
- Optimized assets
- Code splitting
- Tree shaking

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Commit and push
5. Create a pull request

## 📄 License

MIT License

## 🆘 Support

For support, please:
1. Check the documentation
2. Open an issue
3. Contact support

---

**Built with ❤️ using React, TypeScript, and Vite**
