# 🍽️ Forkly - Restaurant Management System (Server)

A robust Node.js/Express backend server for Forkly restaurant management system. Handles authentication, menu management, user management, orders, payments, reservations, and reviews with MongoDB database and Stripe payment processing.

---

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [API Endpoints](#api-endpoints)
- [Data Flow Workflow](#data-flow-workflow)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Running the Server](#running-the-server)
- [Project Structure](#project-structure)
- [Database Collections](#database-collections)
- [Authentication](#authentication)
- [Error Handling](#error-handling)

---

## ✨ Features

### 🔐 Authentication & Security
- **JWT Token Authentication** - Secure API endpoints
- **Role-based Access Control** - Admin and User roles
- **Token Verification** - Middleware for protected routes
- **Email Verification** - Admin email authentication
- **CORS Protection** - Configurable origin allowlist

### 📋 Menu Management
- **Create Menu Items** - Add new food items with details
- **Read Menu** - Retrieve all or specific menu items
- **Update Menu** - Modify existing menu items
- **Delete Menu** - Remove items from menu
- **Image Upload** - Store food item images
- **Category Management** - Organize items by category

### 👥 User Management
- **User Registration** - Create new user accounts
- **User Profile** - Store user information
- **Admin Promotion** - Assign admin roles to users
- **User Listing** - View all registered users
- **User Deletion** - Remove user accounts

### 🛒 Cart Management
- **Add to Cart** - Add items to user's cart
- **View Cart** - Retrieve cart items
- **Remove from Cart** - Delete items from cart
- **Cart Persistence** - Maintain cart in database

### 💳 Payment Processing
- **Stripe Integration** - Secure payment processing
- **Payment Intent Creation** - Initialize Stripe payment
- **Payment History** - Track all payments
- **Payment Records** - Store payment details
- **Admin Payment View** - View all payments
- **Revenue Tracking** - Calculate total revenue

### 📅 Booking & Reservation
- **Create Booking** - Reserve tables
- **View Bookings** - Retrieve user bookings
- **Update Booking Status** - Manage reservation status
- **Cancel Booking** - Delete reservations
- **Admin Booking Management** - Handle all bookings
- **Local Storage Support** - Backup bookings to JSON
- **Booking Summary** - Analytics for admin

### ⭐ Reviews & Ratings
- **Add Review** - Create food reviews with ratings
- **View Reviews** - Retrieve all reviews
- **Admin Review Moderation** - Approve/reject reviews
- **Delete Reviews** - Remove inappropriate content
- **Review Management** - Full CRUD operations

### ⚙️ Restaurant Settings
- **Get Settings** - Retrieve restaurant configuration
- **Update Settings** - Modify restaurant details
- **Default Configuration** - Pre-configured defaults
- **Settings Persistence** - Store in database

### 📊 Admin Dashboard
- **Admin Stats** - Revenue, orders, users statistics
- **Recent Activity** - Latest orders and bookings
- **Booking Summary** - Reservation analytics
- **Payment Analytics** - Payment trends and data

---

## 🏗️ Tech Stack

### Core Framework
- **Express.js 4.19.2** - Web server framework
- **Node.js** - JavaScript runtime

### Database
- **MongoDB 6.6.2** - NoSQL database
- **MongoDB Atlas** - Cloud database (optional)

### Security & Authentication
- **JWT (JSON Web Tokens) 9.0.2** - Token-based authentication
- **CORS 2.8.5** - Cross-Origin Resource Sharing
- **dotenv 16.4.5** - Environment variable management

### Payment Processing
- **Stripe 15.10.0** - Payment gateway integration

### File System
- **Node.js fs/promises** - File operations
- **Node.js path** - Path utilities

---

## 🔄 API Endpoints

### Authentication
```
POST   /jwt                    - Generate JWT token
```

### Menu Management
```
GET    /menu                   - Get all menu items
POST   /menu                   - Create menu item (Admin)
GET    /menu/:id               - Get specific menu item
PATCH  /menu/:id               - Update menu item (Admin)
DELETE /menu/:id               - Delete menu item (Admin)
POST   /menu-images            - Upload menu item image (Admin)
```

### Reviews
```
GET    /reviews                - Get all reviews
POST   /reviews                - Create review (Authenticated)
GET    /admin/reviews          - Get all reviews for admin (Admin)
PATCH  /reviews/:id            - Update review status (Admin)
DELETE /reviews/:id            - Delete review (Admin)
```

### Cart
```
GET    /carts                  - Get user's cart items (Authenticated)
POST   /carts                  - Add item to cart (Authenticated)
DELETE /carts/:id              - Remove item from cart (Authenticated)
```

### Users
```
POST   /users                  - Register new user
GET    /users                  - Get all users (Admin)
GET    /users/admin/:email     - Check if user is admin
PATCH  /users/admin/:id        - Promote user to admin (Admin)
DELETE /users/:id              - Delete user (Admin)
```

### Bookings
```
GET    /bookings               - Get user's bookings (Authenticated)
POST   /bookings               - Create booking (Authenticated)
PATCH  /bookings/:id           - Update booking status (Admin)
DELETE /bookings/:id           - Cancel booking (Authenticated)
```

### Payments
```
POST   /create-payment-intent  - Create Stripe payment intent (Authenticated)
POST   /payment                - Record payment (Authenticated)
GET    /payments/:email        - Get user's payment history (Authenticated)
GET    /admin/payments         - Get all payments (Admin)
```

### Admin Dashboard
```
GET    /admin-stats            - Get dashboard statistics (Admin)
GET    /admin/recent-activity  - Get recent orders & bookings (Admin)
GET    /admin/bookings-summary - Get booking analytics (Admin)
GET    /admin/settings         - Get restaurant settings (Admin)
PATCH  /admin/settings         - Update settings (Admin)
```

### Utility
```
GET    /                       - Root endpoint
GET    /health                 - Health check
```

---

## 🔄 Data Flow Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT REQUEST                           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │  CORS Validation            │
        │  (Check origin allowlist)   │
        └──────────┬──────────────────┘
                   │
                   ▼
        ┌─────────────────────────────┐
        │  Route Matching             │
        │  Express Router             │
        └──────────┬──────────────────┘
                   │
         ┌─────────┴──────────┐
         │                    │
         ▼                    ▼
    ┌─────────────┐   ┌──────────────┐
    │ Public Route│   │ Protected    │
    │ (No Auth)   │   │ Route        │
    └──────┬──────┘   └───────┬──────┘
           │                  │
           │          ┌───────▼────────┐
           │          │ JWT Verification│
           │          │ verifyToken()   │
           │          └───────┬────────┘
           │                  │
           │        ┌─────────▼────────┐
           │        │ Admin Check      │
           │        │ verifyAdmin()    │
           │        └───────┬──────────┘
           │                │
           └────────┬───────┘
                    │
                    ▼
        ┌─────────────────────────────┐
        │  Route Handler              │
        │  - Validate Input           │
        │  - Execute Logic            │
        └──────────┬──────────────────┘
                   │
         ┌─────────┴──────────┐
         │                    │
         ▼                    ▼
    ┌─────────────┐   ┌──────────────┐
    │ MongoDB     │   │ External API │
    │ Operation   │   │ (Stripe)     │
    │ (CRUD)      │   │ (Payment)    │
    └──────┬──────┘   └───────┬──────┘
           │                  │
           └────────┬─────────┘
                    │
                    ▼
        ┌─────────────────────────────┐
        │  Response Preparation       │
        │  - Status Code              │
        │  - Data Serialization       │
        │  - Error Handling           │
        └──────────┬──────────────────┘
                   │
                   ▼
        ┌─────────────────────────────┐
        │  Send Response to Client    │
        │  - JSON Data                │
        │  - Status Code              │
        │  - Headers                  │
        └─────────────────────────────┘
```

### Request/Response Cycle Example (Menu Creation)

```
CLIENT (POST /menu)
        │ Headers: { Authorization: "Bearer TOKEN" }
        │ Body: { name, price, category, image }
        ▼
CORS CHECK ✓
        │
        ▼
ROUTE HANDLER (POST /menu)
        │
        ▼
JWT VERIFICATION ✓ (Token valid)
        │
        ▼
ADMIN CHECK ✓ (User is admin)
        │
        ▼
VALIDATE INPUT ✓
        │
        ▼
MONGODB INSERT
        │ (Insert into menuCollection)
        ▼
RESPONSE ✓ 201 Created
        │ { success: true, data: menuItem }
        ▼
CLIENT RECEIVES DATA
```

---

## 🚀 Installation

### Prerequisites
- Node.js 14+ and npm
- MongoDB Account (local or Atlas)
- Stripe Account
- Environment credentials

### Steps

1. **Clone Repository**
   ```bash
   cd server
   npm install
   ```

2. **Create `.env` file**
   ```bash
   touch .env
   ```

3. **Configure Environment Variables** (see below)

4. **Install Dependencies**
   ```bash
   npm install
   ```

5. **Run Server**
   ```bash
   npm run dev
   ```

---

## ⚙️ Environment Configuration

Create a `.env` file in the server root directory:

```env
# Server
PORT=5000
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname?retryWrites=true&w=majority
# OR use these if MONGO_URI is not available:
DB_USER=your_mongo_user
DB_PASS=your_mongo_password
DB_HOSTS=your_mongo_hosts

# Authentication
ACCESS_TOKEN_SECRET=your_jwt_secret_key_here_make_it_strong

# Stripe
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key

# CORS
CLIENT_URL=http://localhost:5173
CLIENT_URLS=http://localhost:5173,http://localhost:3000
```

---

## ▶️ Running the Server

### Development Mode
Automatically detects and kills existing process on port 5000, then starts fresh:
```bash
npm run dev
```

### Stop Server
```bash
npm run stop
```

### Production Mode
```bash
npm start
```

### Health Check
```bash
curl http://localhost:5000/health
```

---

## 📂 Project Structure

```
server/
├── index.js                    # Main server file with all routes
├── package.json                # Dependencies
├── .env                        # Environment variables (not in git)
├── .gitignore                  # Git ignore rules
├── data/
│   └── bookings.json          # Local booking backup storage
├── scripts/
│   └── dev-server.js          # Development server runner (port management)
├── uploads/                   # Uploaded menu item images
└── RUN_BACKEND.md             # Running instructions
```

### Main Collections (MongoDB)

```
bistroBossDB/
├── menu                 # Menu items
├── users                # User accounts
├── carts                # Shopping carts
├── payments             # Payment records
├── bookings             # Table reservations
├── customerReview       # Food reviews
└── settings             # Restaurant configuration
```

---

## 🔐 Authentication

### JWT Token Flow

```
1. CLIENT REGISTERS/LOGS IN
   POST /jwt with email
   ▼
2. SERVER GENERATES TOKEN
   Signed with ACCESS_TOKEN_SECRET
   ▼
3. CLIENT STORES TOKEN
   In localStorage or sessionStorage
   ▼
4. CLIENT SENDS TOKEN
   In Authorization header: "Bearer TOKEN"
   ▼
5. SERVER VERIFIES TOKEN
   verifyToken() middleware checks validity
   ▼
6. TOKEN VALID ✓
   Request proceeds to route handler
   ▼
7. TOKEN INVALID ✗
   Response: 401 Unauthorized
```

### Admin Access Control

```
verifyAdmin() checks:
  └─ Is email === DEV_ADMIN_EMAIL ("admin@gmail.com")
     OR
  └─ Query users collection for role: "admin"
     └─ If found ✓ Allow admin operations
        If not ✓ Return 403 Forbidden
```

---

## 💾 Database Collections

### Menu
```javascript
{
  _id: ObjectId,
  name: String,
  price: Number,
  category: String,
  image: String (image path),
  description: String,
  available: Boolean
}
```

### Users
```javascript
{
  _id: ObjectId,
  email: String (unique),
  displayName: String,
  photoURL: String,
  role: String ("user" or "admin"),
  createdAt: Date
}
```

### Carts
```javascript
{
  _id: ObjectId,
  email: String,
  menuId: ObjectId,
  menuName: String,
  menuPrice: Number,
  menuImage: String,
  quantity: Number
}
```

### Payments
```javascript
{
  _id: ObjectId,
  email: String,
  transactionId: String,
  price: Number,
  quantity: Number,
  date: Date,
  cartItems: Array,
  status: String ("pending", "complete")
}
```

### Bookings
```javascript
{
  _id: ObjectId,
  email: String,
  date: String,
  time: String,
  guests: Number,
  name: String,
  phone: String,
  specialRequests: String,
  status: String ("pending", "confirmed", "cancelled"),
  createdAt: Date
}
```

### Reviews
```javascript
{
  _id: ObjectId,
  email: String,
  displayName: String,
  photoURL: String,
  rating: Number (1-5),
  review: String,
  status: String ("approved", "pending", "rejected"),
  createdAt: Date
}
```

### Settings
```javascript
{
  _id: "restaurant-profile",
  restaurantName: String,
  tagline: String,
  phone: String,
  email: String,
  address: String,
  openingHours: String,
  kitchenHours: String,
  reservationNotice: String,
  maxReservationGuests: Number
}
```

---

## ⚠️ Error Handling

### Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized (Invalid/Missing token)
- `403` - Forbidden (Not admin)
- `404` - Not Found
- `500` - Server Error

### Common Error Responses
```javascript
// Missing token
{ message: "unauthorized access" }

// Invalid token
{ message: "unauthorized access" }

// Admin only
{ message: "forbidden access" }

// Not found
{ message: "Item not found" }

// Server error
{ message: "Internal server error" }
```

---

## 🔒 Security Best Practices

✅ **Implemented**
- JWT token verification for protected routes
- Admin role-based access control
- CORS configuration with allowlist
- MongoDB connection with TLS encryption
- Environment variable protection
- Sensitive data not exposed in responses

⚠️ **To Consider**
- Add request rate limiting
- Input sanitization for XSS prevention
- SQL injection prevention (using MongoDB)
- Add request logging and monitoring
- Implement refresh tokens for better security
- Add request validation schema (Joi/Yup)

---

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

---

## 📝 License

This project is licensed under the ISC License.
