# 📚 SatsEarn Backend MVP - Master Technical Documentation

## 1. System Overview
SatsEarn is a high-concurrency micro-tasking platform where users earn Bitcoin (Sats) for completing actions (Social, Surveys, Quizzes). The backend ensures financial integrity, prevents fraud, and drives retention through deep gamification.

**Tech Stack:**
* **Language/Framework:** Node.js, Express.js, TypeScript
* **Database:** PostgreSQL (Managed via Prisma ORM)
* **Authentication:** Supabase Auth (JWT)
* **Validation:** Zod (Strict Payload/Params/Query validation)
* **Hosting Context:** Render (Web Service) & Render Cron (Background Jobs)

---

## 2. Core Business Engines

### 🏦 The Triple-Balance System
Users have three distinct balances to manage risk and fraud:
1. **`balancePending`**: Funds waiting on a 24-hour AI review or a 15-day security hold.
2. **`balanceLocked`**: Funds from Welcome Bonuses that require specific milestones to unlock.
3. **`balanceAvailable`**: Cleared funds ready for Lightning Network withdrawal.

### 📜 The Immutable Ledger
Every movement of Sats is recorded in the `Ledger` table. This provides a strict audit trail for:
* `TASK_REWARD`: Earned from completing campaigns.
* `REFERRAL_BONUS`: Passive income from invited users.
* `STREAK_BONUS`: Milestone payouts.
* `DAILY_QUIZ_REWARD`: Instant payouts for passing the daily quiz.
* `WITHDRAWAL`: Cash outs to external wallets.

### 🤝 The Referral Engine
* **Lifetime Commission:** Referrers earn a platform-defined percentage (e.g., 5%) of their referrals' task earnings forever.
* **The "Active" Rule:** The dashboard calculates whether a referral is "Active" by checking if they have completed tasks on at least 10 unique days within the last 30 days.

### 🎮 Gamification & Retention
* **Daily Streaks:** Users build streaks by logging activity daily. Milestones (7, 21, 60 days) unlock massive automatic bonuses claimed via the UI.
* **Daily Quiz:** A standalone module where users answer a daily Bitcoin trivia question. Passing awards instant `balanceAvailable` Sats, bypassing the standard 15-day hold.

---

## 3. Full API Endpoint Reference

### 🛡️ Admin Routes (Protected by `requireAdmin`)
*Requires `Authorization: Bearer <SUPABASE_SERVICE_ROLE_TOKEN>`*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/admin/users` | Returns all users with aggregated stats (`_count` of referrals/submissions). |
| `GET` | `/api/admin/submissions/pending` | Returns tasks flagged as `MANUAL_REVIEW` by the AI. |
| `POST` | `/api/admin/campaigns` | Creates a new advertiser campaign and nested tasks. |
| `POST` | `/api/admin/quiz/daily` | Creates the Daily Quiz and associated questions. |

### 👤 User Routes (Protected by `requireAuth`)
*Requires `Authorization: Bearer <USER_JWT>`*

#### **Profile & Dashboard**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/user/profile` | Fetches KYC, Tier, Level, and connected social handles. |
| `PATCH` | `/api/user/profile` | Updates user details (Validated by Zod `updateProfileSchema`). |
| `GET` | `/api/user/dashboard` | Fetches Triple Balances and recent Ledger activity. |
| `POST` | `/api/user/change-password` | Updates the Supabase Auth password. |
| `DELETE` | `/api/user/account` | Soft deletes account (wipes PII, anonymizes email, keeps financial math intact). |

#### **Earning Loop (Tasks)**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/user/campaigns` | Returns campaigns filtered by user's Tier and Country. |
| `GET` | `/api/user/campaigns/:id` | Returns specific campaign details and nested tasks. |
| `POST` | `/api/user/tasks/:taskId/start` | Checks budget limits and returns specific category instructions (e.g., `UPLOAD_SCREENSHOT`). |
| `POST` | `/api/user/tasks/:taskId/submit` | Submits proof, runs AI verifier, updates Ledgers, pays Referrer (Wrapped in `Serializable` transaction). |

#### **Gamification & Ecosystem**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/user/referrals` | Returns downline stats, active/inactive counts, and lifetime earnings. |
| `GET` | `/api/user/unlocks` | Returns a timeline of when `LOCKED_15D` funds will become available. |
| `POST` | `/api/user/streak/claim` | Mints the streak milestone bonus (7, 21, 60 days) to the user's available balance. |
| `GET` | `/api/user/quiz/today` | Fetches today's Daily Quiz questions (Answers hidden). |
| `POST` | `/api/user/quiz/today/submit` | Grades the user's array of answers and instantly pays out if 100% correct. |

---

## 4. Master Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ==========================================
// ENUMS
// ==========================================

enum Role { USER, SUPER_ADMIN }
enum Tier { BASIC, BRONZE, SILVER, GOLD }
enum TaskCategory { SOCIAL, SURVEY, VIDEO_AD, APP_INSTALL, OFFERWALL, LEARN_EARN, DAILY_STREAK }
enum SubmissionStatus { PENDING_24H, LOCKED_15D, WITHDRAWABLE, MANUAL_REVIEW, REJECTED }
enum WithdrawalStatus { PENDING, PAID, REJECTED }
enum TransactionType { TASK_REWARD, REFERRAL_BONUS, WITHDRAWAL, WELCOME_BONUS, PENALTY, STREAK_BONUS, DAILY_QUIZ_REWARD }
enum AnnouncementType { INFO, WARNING, SUCCESS, PROMOTION }

// ==========================================
// CORE MODELS
// ==========================================

model User {
  id               String   @id @default(uuid())
  supabaseAuthId   String   @unique 
  email            String   @unique
  phone            String?  @unique
  role             Role     @default(USER)
  
  fullName         String?
  country          String?  
  dateOfBirth      DateTime?
  
  // Balances
  balanceAvailable Int      @default(0) 
  balancePending   Int      @default(0) 
  balanceLocked    Int      @default(0) 

  // Gamification
  tier             Tier     @default(BASIC)
  xp               Int      @default(0)
  level            Int      @default(0)
  currentStreak    Int      @default(0)
  lastActivityAt   DateTime @default(now())
  
  // Socials
  twitterHandle    String?
  instagramHandle  String?
  telegramHandle   String?
  discordHandle    String?

  // Referrals
  referralCode     String   @unique
  referredById     String?
  referredBy       User?    @relation("UserReferrals", fields: [referredById], references: [id])
  referrals        User[]   @relation("UserReferrals")

  // Relations
  submissions      Submission[]
  withdrawals      Withdrawal[]
  transactions     Ledger[]     
  quizAttempts     QuizAttempt[]
  
  isActive         Boolean  @default(true) 
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([role])
}

model Ledger {
  id            String          @id @default(uuid())
  userId        String
  user          User            @relation(fields: [userId], references: [id])
  amountSats    Int             
  type          TransactionType
  description   String?         
  referenceId   String?         
  createdAt     DateTime        @default(now())

  @@index([userId, type])
}

model PlatformSettings {
  id                   String   @id @default(uuid())
  welcomeBonusSats     Int      @default(50)
  minWithdrawalSats    Int      @default(25000)
  securityLockDays     Int      @default(15)
  referralBonusPercent Int      @default(5) 
  baseXpPerTask        Int      @default(10)
  dailyStreakBonusXp   Int      @default(5)
  updatedAt            DateTime @updatedAt
}

// ==========================================
// CAMPAIGNS & TASKS
// ==========================================

model Campaign {
  id                 String       @id @default(uuid())
  title              String
  description        String
  category           TaskCategory
  targetUrl          String?
  socialHandleTarget String?      
  targetCountries    String[]     
  requiredTier       Tier         @default(BASIC)
  rewardSats         Int
  totalCompletions   Int          @default(0)
  maxCompletions     Int          
  isActive           Boolean      @default(true)
  tasks              Task[]
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt

  @@index([isActive, requiredTier]) 
}

model Task {
  id                 String       @id @default(uuid())
  campaignId         String
  campaign           Campaign     @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  title              String?      
  description        String?
  targetUrl          String?
  rewardSatsOverride Int?         
  requirements       Json?        
  submissions        Submission[]
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt
}

model Submission {
  id               String           @id @default(uuid())
  userId           String
  user             User             @relation(fields: [userId], references: [id])
  taskId           String
  task             Task             @relation(fields: [taskId], references: [id])
  screenshotUrl    String           
  imageHash        String?          
  ocrExtractedText String?          @db.Text 
  confidenceScore  Int              @default(0)
  status           SubmissionStatus @default(PENDING_24H)
  rejectionReason  String?
  reviewedById     String?          
  submittedAt      DateTime         @default(now())
  reverifyAt       DateTime?        
  unlockAt         DateTime?        
  
  @@unique([userId, taskId])
  @@index([status]) 
}

// ==========================================
// DAILY QUIZ GAMIFICATION
// ==========================================

model DailyQuiz {
  id          String         @id @default(uuid())
  date        DateTime       @unique @db.Date 
  title       String   
  rewardSats  Int            @default(10) 
  isActive    Boolean        @default(true)
  questions   QuizQuestion[]
  attempts    QuizAttempt[]
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}

model QuizQuestion {
  id            String    @id @default(uuid())
  dailyQuizId   String
  dailyQuiz     DailyQuiz @relation(fields: [dailyQuizId], references: [id], onDelete: Cascade)
  questionText  String    @db.Text
  options       String[] 
  correctAnswer String   
  order         Int       @default(0) 
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  @@index([dailyQuizId])
}

model QuizAttempt {
  id            String    @id @default(uuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id])
  dailyQuizId   String
  dailyQuiz     DailyQuiz @relation(fields: [dailyQuizId], references: [id])
  score         Int
  passed        Boolean  
  createdAt     DateTime  @default(now())

  @@unique([userId, dailyQuizId]) 
}

// ==========================================
// WITHDRAWALS & MISC
// ==========================================

model Withdrawal {
  id               String           @id @default(uuid())
  userId           String
  user             User             @relation(fields: [userId], references: [id])
  amountSats       Int
  lightningInvoice String           @db.Text 
  paymentProof     String?          
  status           WithdrawalStatus @default(PENDING)
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  @@index([status])
}

model Announcement {
  id        String           @id @default(uuid())
  title     String
  content   String           @db.Text
  type      AnnouncementType @default(INFO)
  isActive  Boolean          @default(true)
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt
}