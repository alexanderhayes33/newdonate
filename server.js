// server.js - Multi-User Alert System with Enhanced Bank Transfer Support + Domain Configuration
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const https = require('https'); // 🔧 เพิ่มสำหรับ HTTPS support

// Import custom modules
const UserManager = require('./utils/UserManager');
const TemplateEngine = require('./utils/TemplateEngine');

// Import TrueWallet API (optional)
let truewallet;
try {
    truewallet = require('./apis/truewallet');
    console.log('✅ TrueWallet API loaded');
} catch (error) {
    console.error('❌ TrueWallet API not found:', error.message);
    console.log('ℹ️ TrueWallet features will be disabled');
}

const HOMEPAGE_PASSWORD = process.env.HOMEPAGE_PASSWORD || 'Ba225teW'; // 🔒 รหัสสำหรับเข้า homepage
// ⚙️ Configuration - 🔧 Enhanced with Domain Support
const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.DOMAIN || 'chatmateth.chat'; // 🔧 เพิ่ม Domain Configuration
const USE_HTTPS = process.env.USE_HTTPS === 'true'; // 🔧 เพิ่ม HTTPS Support

// Slip verification API credentials
const SLIP_CLIENT_ID = process.env.SLIP_CLIENT_ID || '28b0ed6dd3c9457ca7a50f976aaa1f79';
const SLIP_CLIENT_SECRET = process.env.SLIP_CLIENT_SECRET || 'lDRsRCLi52pKIk3QLY5Ov';

// สร้าง Express app
const app = express();
const server = http.createServer(app);

// 🔧 Enhanced Socket.IO Configuration with Domain Support
const io = socketIo(server, {
    cors: {
        origin: [
            `http://${DOMAIN}`,        // 🔧 รองรับ http://chatmateth.chat
            `https://${DOMAIN}`,       // 🔧 รองรับ https://chatmateth.chat
            `http://localhost:${PORT}`,
            `http://127.0.0.1:${PORT}`,
            "http://localhost:3000",   // เก็บ default port
            "http://127.0.0.1:3000",   // เก็บ default port
            "*"                        // เก็บไว้สำหรับ development
        ],
        methods: ["GET", "POST"],
        credentials: true              // 🔧 เพิ่ม credentials support
    },
    allowEIO3: true
});

// สร้าง instances
const userManager = new UserManager();
const templateEngine = new TemplateEngine();

// แสดง debug info
console.log('🔍 System Debug Info:');
templateEngine.debugInfo();

// ===============================
// Utility Functions
// ===============================
function getBangkokTime() {
    return new Date().toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function isUserActive(lastActiveAt) {
    return Date.now() - lastActiveAt < 7 * 24 * 60 * 60 * 1000;
}

// ===============================
// Enhanced Bank Account Validation
// ===============================
function validateBankAccountPattern(userAccount, apiAccountValue) {
    try {
        if (!userAccount || !apiAccountValue) {
            console.log('🔍 Validation failed: Missing account data');
            return false;
        }

        // Extract เฉพาะตัวเลข
        const userNumbers = userAccount.replace(/[^0-9]/g, '');
        const apiNumbers = apiAccountValue.replace(/[^0-9]/g, '');
        
        if (!userNumbers || !apiNumbers) {
            console.log('🔍 Validation failed: No numbers found');
            return false;
        }

        console.log('🔍 Enhanced Account validation:', {
            userAccount: userAccount,
            userNumbers: userNumbers,
            apiPattern: apiAccountValue,
            apiNumbers: apiNumbers
        });

        // 🔥 Algorithm ใหม่: เช็คทุก substring ที่เป็นไปได้
        const apiLength = apiNumbers.length;
        
        // เช็คทุกตำแหน่งในเลขบัญชี user
        for (let i = 0; i <= userNumbers.length - apiLength; i++) {
            const userSubstring = userNumbers.substring(i, i + apiLength);
            if (userSubstring === apiNumbers) {
                console.log(`✅ Match found: "${apiNumbers}" at position ${i} in "${userNumbers}"`);
                console.log(`✅ Substring: "${userSubstring}" === "${apiNumbers}"`);
                return true;
            }
        }
        
        // ถ้าไม่เจอ ลองเช็คแบบเดิมเผื่อกรณีพิเศษ
        const fallbackChecks = [
            // เช็คหลักท้าย
            userNumbers.endsWith(apiNumbers),
            // เช็คหลักหน้า  
            userNumbers.startsWith(apiNumbers),
            // เช็ครวมทั้งหมด (กรณี API ส่งมาครบ)
            userNumbers.includes(apiNumbers)
        ];
        
        const fallbackResult = fallbackChecks.some(check => check);
        
        if (fallbackResult) {
            console.log(`✅ Fallback validation passed for: "${apiNumbers}"`);
            return true;
        }
        
        console.log(`❌ No match found: "${apiNumbers}" not found in "${userNumbers}"`);
        return false;
        
    } catch (error) {
        console.error('Error in bank account validation:', error);
        return false;
    }
}

// ===============================
// Express Configuration - 🔧 Enhanced
// ===============================
app.use('/user/:username/*', (req, res, next) => {
    // Log session info สำหรับ debug
    if (req.method === 'POST' && req.path.includes('/api/')) {
        console.log(`📊 Session Debug for ${req.username}:`, {
            sessionID: req.sessionID?.substring(0, 8) + '...',
            sessionExists: !!req.session,
            userAuthExists: !!(req.session && req.session.userAuth),
            userInSession: !!(req.session && req.session.userAuth && req.session.userAuth[req.username]),
            method: req.method,
            path: req.path,
            timestamp: new Date().toISOString()
        });
    }
    next();
});
// 🔧 Middleware สำหรับ HTTPS Redirect (เพิ่มใหม่)
app.use((req, res, next) => {
    // ถ้าใช้ Cloudflare และต้องการ Force HTTPS
    if (req.headers['x-forwarded-proto'] === 'http' && USE_HTTPS) {
        return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
});

// 🔧 Trust proxy headers (สำคัญสำหรับ Cloudflare)
app.set('trust proxy', true);

// 🔧 Enhanced CORS Configuration with Domain Support
app.use(cors({
    origin: [
        `http://${DOMAIN}`,        // 🔧 รองรับ http://chatmateth.chat
        `https://${DOMAIN}`,       // 🔧 รองรับ https://chatmateth.chat
        `http://localhost:${PORT}`,
        `http://127.0.0.1:${PORT}`,
        "http://localhost:3000",   // เก็บ default port
        "http://127.0.0.1:3000",   // เก็บ default port
        "*"                        // เก็บไว้สำหรับ development
    ],
    credentials: true              // 🔧 เพิ่ม credentials support
}));

app.use(express.json({ limit: '10mb' })); // เพิ่ม limit สำหรับรูปภาพ
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🔧 Security Headers สำหรับ HTTPS (เพิ่มใหม่)
app.use((req, res, next) => {
    if (USE_HTTPS) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
    }
    next();
});

app.use(require('express-session')({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production-very-long-and-secure',
    resave: true,  // 🔧 เปลี่ยนเป็น true
    saveUninitialized: false,
    rolling: true, // 🔧 เปลี่ยนเป็น true
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    },
    name: 'alert_system_session'
}));

function requireHomepageAuth(req, res, next) {
    // ถ้าเป็น API หรือ user pages ให้ผ่าน
    if (req.path.startsWith('/api/') || 
        req.path.startsWith('/user/') || 
        req.path === '/login' || 
        req.path === '/auth') {
        return next();
    }
    
    // ตรวจสอบว่า login แล้วหรือยัง
    if (req.session.homepageAuth) {
        return next();
    }
    
    // ถ้ายังไม่ login ให้ redirect ไปหน้า login
    res.redirect('/login');
}

app.use('/', requireHomepageAuth);

// 🔐 หน้า Login
app.get('/login', (req, res) => {
    const error = req.query.error;
    const html = `
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🔒 Admin Login - Alert System</title>
        <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Kanit', sans-serif;
                background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
                color: #ffffff;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
            }
            
            /* Animated Background */
            .background-animation {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: -1;
                overflow: hidden;
            }
            
            .floating-shapes {
                position: absolute;
                width: 100%;
                height: 100%;
            }
            
            .shape {
                position: absolute;
                background: linear-gradient(45deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
                border-radius: 50%;
                animation: float 20s infinite linear;
            }
            
            .shape:nth-child(1) {
                width: 80px;
                height: 80px;
                top: 20%;
                left: 10%;
                animation-delay: 0s;
            }
            
            .shape:nth-child(2) {
                width: 120px;
                height: 120px;
                top: 60%;
                right: 10%;
                animation-delay: 5s;
            }
            
            .shape:nth-child(3) {
                width: 60px;
                height: 60px;
                top: 80%;
                left: 50%;
                animation-delay: 10s;
            }
            
            @keyframes float {
                0%, 100% {
                    transform: translateY(0px) rotate(0deg);
                    opacity: 0.5;
                }
                50% {
                    transform: translateY(-20px) rotate(180deg);
                    opacity: 0.8;
                }
            }
            
            .login-container {
                background: rgba(255, 255, 255, 0.05);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 24px;
                padding: 40px;
                width: 100%;
                max-width: 400px;
                text-align: center;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            }
            
            .logo {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 15px;
                font-size: 28px;
                font-weight: 800;
                background: linear-gradient(135deg, #667eea, #764ba2);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                margin-bottom: 30px;
            }
            
            .logo .icon {
                width: 50px;
                height: 50px;
                background: linear-gradient(135deg, #667eea, #764ba2);
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                color: white;
                box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
            }
            
            h1 {
                font-size: 2em;
                font-weight: 700;
                margin-bottom: 10px;
                background: linear-gradient(135deg, #667eea, #764ba2);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            
            .subtitle {
                color: rgba(255, 255, 255, 0.7);
                margin-bottom: 30px;
                font-size: 1.1em;
            }
            
            .form-group {
                margin-bottom: 25px;
                text-align: left;
            }
            
            label {
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
                color: rgba(255, 255, 255, 0.9);
                font-size: 15px;
            }
            
            input[type="password"] {
                width: 100%;
                padding: 16px 20px;
                background: rgba(255, 255, 255, 0.1);
                border: 2px solid rgba(255, 255, 255, 0.2);
                border-radius: 16px;
                color: white;
                font-size: 16px;
                font-family: 'Kanit', sans-serif;
                transition: all 0.3s ease;
            }
            
            input[type="password"]:focus {
                outline: none;
                border-color: #667eea;
                background: rgba(255, 255, 255, 0.15);
                box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.2);
            }
            
            input[type="password"]::placeholder {
                color: rgba(255, 255, 255, 0.5);
            }
            
            .login-btn {
                width: 100%;
                padding: 16px 32px;
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                border: none;
                border-radius: 16px;
                font-size: 16px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
                margin-bottom: 20px;
            }
            
            .login-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 12px 40px rgba(102, 126, 234, 0.4);
                background: linear-gradient(135deg, #5a67d8, #6b46c1);
            }
            
            .error-message {
                background: rgba(239, 68, 68, 0.2);
                border: 1px solid rgba(239, 68, 68, 0.3);
                color: #fca5a5;
                padding: 12px 16px;
                border-radius: 12px;
                margin-bottom: 20px;
                font-size: 14px;
            }
            
            .info {
                color: rgba(255, 255, 255, 0.6);
                font-size: 14px;
                line-height: 1.5;
            }
            
            @media (max-width: 480px) {
                .login-container {
                    margin: 20px;
                    padding: 30px;
                }
                
                .logo {
                    font-size: 24px;
                }
                
                h1 {
                    font-size: 1.8em;
                }
            }
        </style>
    </head>
    <body>
        <!-- Animated Background -->
        <div class="background-animation">
            <div class="floating-shapes">
                <div class="shape"></div>
                <div class="shape"></div>
                <div class="shape"></div>
            </div>
        </div>
        
        <div class="login-container">
            <div class="logo">
                <div class="icon">🔒</div>
                <span>Admin Access</span>
            </div>
            
            <h1>เข้าสู่ระบบ</h1>
            <p class="subtitle">กรุณาใส่รหัสผ่านเพื่อเข้าสู่หน้า Admin</p>
            
            ${error ? `<div class="error-message">❌ รหัสผ่านไม่ถูกต้อง</div>` : ''}
            
            <form action="/auth" method="post">
                <div class="form-group">
                    <label for="password">🔑 รหัสผ่าน</label>
                    <input type="password" id="password" name="password" placeholder="ใส่รหัสผ่าน" required autofocus>
                </div>
                
                <button type="submit" class="login-btn">🚀 เข้าสู่ระบบ</button>
            </form>
            
            <div class="info">
                <p>🔐 หน้านี้ป้องกันการเข้าถึงหน้า Admin Dashboard</p>
                <p>📱 User pages ยังคงเข้าได้ปกติโดยไม่ต้องรหัสผ่าน</p>
            </div>
        </div>
        
        <script>
            // Focus on password input
            document.getElementById('password').focus();
            
            // Enter key submit
            document.getElementById('password').addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.target.closest('form').submit();
                }
            });
        </script>
    </body>
    </html>
    `;
    
    res.send(html);
});

// 🔐 ตรวจสอบรหัสผ่าน
app.post('/auth', (req, res) => {
    const { password } = req.body;
    
    if (password === HOMEPAGE_PASSWORD) {
        req.session.homepageAuth = true;
        console.log(`✅ Admin login successful from IP: ${req.ip}`);
        res.redirect('/');
    } else {
        console.log(`❌ Failed admin login attempt from IP: ${req.ip}`);
        res.redirect('/login?error=1');
    }
});

// 🚪 Logout
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/login');
    });
});

// Logging middleware
app.use((req, res, next) => {
    console.log(`📝 ${req.method} ${req.url}`);
    if (Object.keys(req.body).length > 0 && !req.url.includes('/api/verify-slip')) {
        console.log(`📋 Body:`, req.body);
    }
    next();
});

// ===============================
// Username Parameter Middleware
// ===============================
app.param('username', (req, res, next, username) => {
    // 1. ตรวจสอบรูปแบบ username ก่อน
    const validation = userManager.validateUsername(username);
    
    if (!validation.isValid) {
        return res.status(400).json({
            success: false,
            error: 'Invalid username format',
            message: `Invalid username: ${validation.errors.join(', ')}`
        });
    }
    
    // 2. ตรวจสอบว่า user มีอยู่จริงหรือไม่
    if (!userManager.userExists(username)) {
        console.log(`❌ User not found: ${username}`);
        
        // Return 404 HTML page for browser requests
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html lang="th">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>User Not Found</title>
                    <style>
                        body {
                            font-family: 'Kanit', sans-serif;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin: 0;
                            padding: 20px;
                        }
                        .container {
                            background: rgba(255, 255, 255, 0.1);
                            backdrop-filter: blur(20px);
                            border: 1px solid rgba(255, 255, 255, 0.2);
                            border-radius: 20px;
                            padding: 40px;
                            text-align: center;
                            max-width: 500px;
                            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                        }
                        h1 {
                            font-size: 2.5em;
                            margin-bottom: 20px;
                            background: linear-gradient(135deg, #ff6b6b, #feca57);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                            background-clip: text;
                        }
                        p {
                            font-size: 1.2em;
                            margin-bottom: 30px;
                            opacity: 0.9;
                        }
                        .username {
                            background: rgba(255, 255, 255, 0.2);
                            padding: 10px 20px;
                            border-radius: 10px;
                            font-family: monospace;
                            font-weight: bold;
                            margin: 0 10px;
                        }
                        .btn {
                            display: inline-block;
                            padding: 15px 30px;
                            background: linear-gradient(135deg, #10b981, #34d399);
                            color: white;
                            text-decoration: none;
                            border-radius: 15px;
                            font-weight: 600;
                            transition: all 0.3s ease;
                            margin: 0 10px;
                        }
                        .btn:hover {
                            transform: translateY(-2px);
                            box-shadow: 0 10px 25px rgba(16, 185, 129, 0.3);
                        }
                        .btn.secondary {
                            background: linear-gradient(135deg, #6b7280, #9ca3af);
                        }
                        .btn.secondary:hover {
                            box-shadow: 0 10px 25px rgba(107, 114, 128, 0.3);
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🚫 User Not Found</h1>
                        <p>
                            ไม่พบผู้ใช้ <span class="username">${username}</span> ในระบบ
                        </p>
                        <p>กรุณาตรวจสอบชื่อผู้ใช้หรือสร้างบัญชีใหม่</p>
                    </div>
                </body>
                </html>
            `);
        }
        
        // Return JSON for API requests
        return res.status(404).json({
            success: false,
            error: 'User not found',
            message: `User '${username}' not found in the system`,
            suggestion: 'Please check the username or create a new account'
        });
    }
    
    // 3. โหลดข้อมูล user และเก็บไว้ใน req
    try {
        req.username = username;
        req.userData = userManager.loadUserData(username);
        
        console.log(`✅ User validated: ${username}`);
        next();
    } catch (error) {
        console.error(`❌ Error loading user data for ${username}:`, error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: 'Failed to load user data'
        });
    }
});
// ===============================
// User Authentication Middleware
// ===============================
function requireUserAuth(req, res, next) {
    const username = req.username;
    
    console.log(`🔐 === DETAILED AUTH CHECK for ${username} ===`);
    console.log(`📋 Session Details:`, {
        sessionExists: !!req.session,
        sessionID: req.sessionID?.substring(0, 8) + '...',
        userAuthExists: !!(req.session && req.session.userAuth),
        userInAuth: !!(req.session && req.session.userAuth && req.session.userAuth[username])
    });
    
    // ตรวจสอบว่า session object มีอยู่
    if (!req.session) {
        console.log(`❌ No session object for ${username}`);
        return redirectToLogin(req, res, 'No session object');
    }
    
    // 🔧 สร้าง userAuth object ถ้ายังไม่มี
    if (!req.session.userAuth) {
        console.log(`⚠️ Creating userAuth object for session`);
        req.session.userAuth = {};
    }
    
    // ตรวจสอบว่าล็อกอินแล้วหรือยัง
    const userSession = req.session.userAuth[username];
    if (!userSession) {
        console.log(`❌ User ${username} not in session`);
        console.log(`📋 Available users:`, Object.keys(req.session.userAuth));
        return redirectToLogin(req, res, 'User not in session');
    }
    
    // ตรวจสอบว่า session หมดอายุหรือไม่ (24 ชั่วโมง)
    const sessionAge = Date.now() - userSession.loginAt;
    const maxAge = 24 * 60 * 60 * 1000;
    
    if (sessionAge > maxAge) {
        console.log(`❌ Session expired for ${username}`);
        delete req.session.userAuth[username];
        return redirectToLogin(req, res, 'Session expired');
    }
    
    // ✅ ล็อกอินแล้ว - อัพเดท lastAccessAt
    userSession.lastAccessAt = Date.now();
    
    console.log(`✅ SUCCESS: User ${username} authenticated successfully`);
    return next();
    
    // Helper function for redirecting to login
    function redirectToLogin(req, res, reason) {
        const isApiRequest = req.path.includes('/api/') || 
                            req.headers.accept?.includes('application/json') ||
                            req.headers['content-type']?.includes('application/json');
        
        if (isApiRequest) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                message: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่',
                loginUrl: `/user/${username}/login`,
                code: 'AUTH_REQUIRED',
                reason: reason,
                debug: {
                    sessionExists: !!req.session,
                    sessionID: req.sessionID?.substring(0, 8) + '...',
                    timestamp: new Date().toISOString()
                }
            });
        }
        
        const returnUrl = req.originalUrl;
        res.redirect(`/user/${username}/login?return=${encodeURIComponent(returnUrl)}&reason=${encodeURIComponent(reason)}`);
    }
}

// ===============================
// Socket.io Connection Handling
// ===============================
io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);
    
    socket.on('join-user-room', (username) => {
        if (userManager.validateUsername(username).isValid) {
            socket.join(`user-${username}`);
            console.log(`👤 Socket ${socket.id} joined room: user-${username}`);
        }
    });
    
    socket.on('send-alert', (data) => {
        if (!data.username || !data.name || !data.amount) {
            socket.emit('alert-error', { message: 'Missing required data' });
            return;
        }
        
        try {
            // 🔧 เปลี่ยนจากเดิม: ไม่บันทึกลงฐานข้อมูล แค่ส่ง alert อย่างเดียว
            const testAlert = {
                id: Date.now() + Math.floor(Math.random() * 1000),
                name: data.name,
                amount: parseInt(data.amount),
                message: data.message || '',
                timestamp: Date.now(),
                isTest: true // 🔧 เพิ่ม flag ระบุว่าเป็นการทดสอบ
            };
            
            // ส่ง alert ไปยัง widget โดยไม่บันทึกลงฐานข้อมูล
            io.to(`user-${data.username}`).emit('new-alert', {
                id: testAlert.id,
                name: testAlert.name,
                amount: testAlert.amount,
                message: testAlert.message,
                timestamp: testAlert.timestamp,
                isTest: true // 🔧 ระบุว่าเป็น test alert
            });
            
            socket.emit('alert-sent', { 
                success: true, 
                message: 'Test alert sent successfully (not saved to database)',
                testAlert: testAlert 
            });
            
            console.log(`🧪 Test alert sent for ${data.username}: ${testAlert.name} - ฿${testAlert.amount} (NOT SAVED)`);
            
        } catch (error) {
            console.error('Error sending test alert:', error);
            socket.emit('alert-error', { message: error.message });
        }
    });
    
    socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
    });
});

// ===============================
// Routes
// ===============================

// 🛠️ หน้า Admin Management
app.get('/admin', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🛠️ Admin Management - User Rental System</title>
        <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Kanit', sans-serif;
                background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
                color: #ffffff;
                min-height: 100vh;
                padding: 20px;
            }
            
            .container {
                max-width: 1400px;
                margin: 0 auto;
            }
            
            .header {
                background: rgba(255, 255, 255, 0.05);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 20px;
                padding: 30px;
                margin-bottom: 30px;
                text-align: center;
            }
            
            .header h1 {
                font-size: 2.5em;
                background: linear-gradient(135deg, #667eea, #764ba2);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                margin-bottom: 10px;
            }
            
            .header p {
                color: rgba(255, 255, 255, 0.7);
                font-size: 1.1em;
            }
            
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            
            .stat-card {
                background: rgba(255, 255, 255, 0.05);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                padding: 25px;
                text-align: center;
            }
            
            .stat-value {
                font-size: 2.5em;
                font-weight: 800;
                background: linear-gradient(135deg, #10b981, #34d399);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                margin-bottom: 10px;
            }
            
            .stat-label {
                color: rgba(255, 255, 255, 0.7);
                font-size: 1em;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            
            .actions-bar {
                background: rgba(255, 255, 255, 0.05);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                padding: 25px;
                margin-bottom: 30px;
                display: flex;
                gap: 15px;
                flex-wrap: wrap;
                align-items: center;
            }
            
            .btn {
                padding: 12px 24px;
                border: none;
                border-radius: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                text-decoration: none;
                display: inline-flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
            }
            
            .btn-primary {
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
            }
            
            .btn-success {
                background: linear-gradient(135deg, #10b981, #34d399);
                color: white;
            }
            
            .btn-warning {
                background: linear-gradient(135deg, #f59e0b, #f97316);
                color: white;
            }
            
            .btn-danger {
                background: linear-gradient(135deg, #ef4444, #dc2626);
                color: white;
            }
            
            .btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            }
            
            .users-table {
                background: rgba(255, 255, 255, 0.05);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                overflow: hidden;
            }
            
            .table-header {
                background: rgba(255, 255, 255, 0.1);
                padding: 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .table-header h2 {
                font-size: 1.5em;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .loading {
                text-align: center;
                padding: 50px;
                color: rgba(255, 255, 255, 0.7);
            }
            
            .user-row {
                display: grid;
                grid-template-columns: auto 1fr auto auto auto auto;
                gap: 20px;
                padding: 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                align-items: center;
            }
            
            .user-row:last-child {
                border-bottom: none;
            }
            
            .user-row:hover {
                background: rgba(255, 255, 255, 0.05);
            }
            
            .user-avatar {
                width: 50px;
                height: 50px;
                background: linear-gradient(135deg, #667eea, #764ba2);
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                font-weight: 700;
                color: white;
            }
            
            .user-info h3 {
                font-size: 1.2em;
                margin-bottom: 5px;
            }
            
            .user-info .details {
                color: rgba(255, 255, 255, 0.7);
                font-size: 0.9em;
                line-height: 1.4;
            }
            
            .rental-status {
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 0.9em;
                font-weight: 600;
                text-align: center;
                min-width: 120px;
            }
            
            .status-rental-active {
                background: rgba(16, 185, 129, 0.2);
                color: #34d399;
                border: 1px solid rgba(16, 185, 129, 0.3);
            }
            
            .status-rental-warning {
                background: rgba(245, 158, 11, 0.2);
                color: #fbbf24;
                border: 1px solid rgba(245, 158, 11, 0.3);
            }
            
            .status-rental-expired {
                background: rgba(239, 68, 68, 0.2);
                color: #fca5a5;
                border: 1px solid rgba(239, 68, 68, 0.3);
            }
            
            .status-permanent {
                background: rgba(102, 126, 234, 0.2);
                color: #a5b4fc;
                border: 1px solid rgba(102, 126, 234, 0.3);
            }
            
            .user-actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }
            
            .btn-sm {
                padding: 8px 16px;
                font-size: 12px;
                border-radius: 8px;
            }
            
            .modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                backdrop-filter: blur(5px);
                z-index: 1000;
                align-items: center;
                justify-content: center;
            }
            
            .modal-content {
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 20px;
                padding: 30px;
                max-width: 500px;
                width: 90%;
                color: white;
            }
            
            .modal h3 {
                margin-bottom: 20px;
                font-size: 1.5em;
            }
            
            .form-group {
                margin-bottom: 20px;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
            }
            
            .form-group input,
            .form-group select {
                width: 100%;
                padding: 12px 16px;
                background: rgba(255, 255, 255, 0.1);
                border: 2px solid rgba(255, 255, 255, 0.2);
                border-radius: 12px;
                color: white;
                font-family: 'Kanit', sans-serif;
            }
            
            .form-group input:focus,
            .form-group select:focus {
                outline: none;
                border-color: #667eea;
                background: rgba(255, 255, 255, 0.15);
            }
            
            .modal-actions {
                display: flex;
                gap: 15px;
                justify-content: flex-end;
                margin-top: 25px;
            }
            
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 25px;
                border-radius: 12px;
                font-weight: 600;
                z-index: 1001;
                transform: translateX(100%);
                transition: transform 0.3s ease;
            }
            
            .notification.show {
                transform: translateX(0);
            }
            
            .notification.success {
                background: linear-gradient(135deg, #10b981, #34d399);
                color: white;
            }
            
            .notification.error {
                background: linear-gradient(135deg, #ef4444, #dc2626);
                color: white;
            }
            
            @media (max-width: 768px) {
                .actions-bar {
                    flex-direction: column;
                    align-items: stretch;
                }
                
                .user-row {
                    grid-template-columns: 1fr;
                    gap: 15px;
                    text-align: center;
                }
                
                .user-actions {
                    justify-content: center;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <!-- Header -->
            <div class="header">
                <h1>🛠️ Admin Management</h1>
                <p>จัดการ Users และระบบ Rental</p>
            </div>
            
            <!-- Stats -->
            <div class="stats-grid" id="statsGrid">
                <div class="stat-card">
                    <div class="stat-value" id="totalUsers">-</div>
                    <div class="stat-label">Total Users</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="rentalUsers">-</div>
                    <div class="stat-label">Rental Users</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="expiredUsers">-</div>
                    <div class="stat-label">Expired Users</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="permanentUsers">-</div>
                    <div class="stat-label">Permanent Users</div>
                </div>
            </div>
            
            <!-- Actions Bar -->
            <div class="actions-bar">
                <button class="btn btn-primary" onclick="refreshData()">
                    🔄 Refresh Data
                </button>
                <button class="btn btn-success" onclick="checkExpiredUsers()">
                    🔍 Check Expired Users
                </button>
                <button class="btn btn-warning" onclick="cleanupExpiredUsers()">
                    🗑️ Cleanup Expired Users
                </button>
                <a href="/" class="btn btn-primary">
                    🏠 Back to Homepage
                </a>
            </div>
            
            <!-- Users Table -->
            <div class="users-table">
                <div class="table-header">
                    <h2>👥 Users Management</h2>
                </div>
                <div id="usersContainer">
                    <div class="loading">
                        <p>🔄 Loading users...</p>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Convert to Rental Modal -->
        <div class="modal" id="convertModal">
            <div class="modal-content">
                <h3>🔄 Convert to Rental User</h3>
                <form id="convertForm">
                    <div class="form-group">
                        <label>Username:</label>
                        <input type="text" id="convertUsername" readonly>
                    </div>
                    <div class="form-group">
                        <label>จำนวนวันให้เช่า:</label>
                        <input type="number" id="convertDays" min="1" max="365" value="30" required>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn" onclick="closeModal('convertModal')">ยกเลิก</button>
                        <button type="submit" class="btn btn-success">แปลงเป็น Rental</button>
                    </div>
                </form>
            </div>
        </div>
        
        <!-- Extend Rental Modal -->
        <div class="modal" id="extendModal">
            <div class="modal-content">
                <h3>📅 Extend Rental Period</h3>
                <form id="extendForm">
                    <div class="form-group">
                        <label>Username:</label>
                        <input type="text" id="extendUsername" readonly>
                    </div>
                    <div class="form-group">
                        <label>เพิ่มจำนวนวัน:</label>
                        <input type="number" id="extendDays" min="1" max="365" value="30" required>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn" onclick="closeModal('extendModal')">ยกเลิก</button>
                        <button type="submit" class="btn btn-success">ต่ออายุ</button>
                    </div>
                </form>
            </div>
        </div>
        
        <!-- Notification -->
        <div class="notification" id="notification"></div>
        
        <script>
            let usersData = [];
            
            // Load data when page loads
            document.addEventListener('DOMContentLoaded', function() {
                refreshData();
            });
            
            // Refresh all data
            async function refreshData() {
                try {
                    const response = await fetch('/api/admin/users');
                    const data = await response.json();
                    
                    if (data.success) {
                        usersData = data.users;
                        updateStats();
                        renderUsers();
                    } else {
                        showNotification('error', 'ไม่สามารถโหลดข้อมูลได้');
                    }
                } catch (error) {
                    console.error('Error refreshing data:', error);
                    showNotification('error', 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
                }
            }
            
            // Update statistics
            function updateStats() {
                const totalUsers = usersData.length;
                const rentalUsers = usersData.filter(u => u.rental.isRental && !u.rental.isExpired).length;
                const expiredUsers = usersData.filter(u => u.rental.isRental && u.rental.isExpired).length;
                const permanentUsers = usersData.filter(u => !u.rental.isRental).length;
                
                document.getElementById('totalUsers').textContent = totalUsers;
                document.getElementById('rentalUsers').textContent = rentalUsers;
                document.getElementById('expiredUsers').textContent = expiredUsers;
                document.getElementById('permanentUsers').textContent = permanentUsers;
            }
            
            // Render users table
            function renderUsers() {
                const container = document.getElementById('usersContainer');
                
                if (usersData.length === 0) {
                    container.innerHTML = '<div class="loading"><p>ไม่มี Users ในระบบ</p></div>';
                    return;
                }
                
                let html = '';
                
                usersData.forEach(user => {
                    const avatar = user.username.charAt(0).toUpperCase();
                    
                    let statusHtml = '';
                    let actionsHtml = '';
                    
                    if (user.rental.isRental) {
                        if (user.rental.isExpired) {
                            statusHtml = '<div class="rental-status status-rental-expired">🚫 หมดอายุแล้ว</div>';
                            actionsHtml = \`
                                <button class="btn btn-success btn-sm" onclick="extendRental('\${user.username}')">
                                    📅 ต่ออายุ
                                </button>
                            \`;
                        } else {
                            const statusClass = user.rental.daysLeft <= 3 ? 'status-rental-warning' : 'status-rental-active';
                            const icon = user.rental.daysLeft <= 3 ? '⚠️' : '📅';
                            statusHtml = \`<div class="rental-status \${statusClass}">\${icon} เหลือ \${user.rental.daysLeft} วัน</div>\`;
                            actionsHtml = \`
                                <button class="btn btn-success btn-sm" onclick="extendRental('\${user.username}')">
                                    📅 ต่ออายุ
                                </button>
                            \`;
                        }
                    } else {
                        statusHtml = '<div class="rental-status status-permanent">♾️ Permanent</div>';
                        actionsHtml = \`
                            <button class="btn btn-warning btn-sm" onclick="convertToRental('\${user.username}')">
                                🔄 Convert to Rental
                            </button>
                        \`;
                    }
                    
                    html += \`
                        <div class="user-row">
                            <div class="user-avatar">\${avatar}</div>
                            <div class="user-info">
                                <h3>\${user.username}</h3>
                                <div class="details">
                                    📺 \${user.streamTitle}<br>
                                    💰 \${user.totalDonations} donations (฿\${user.totalAmount.toLocaleString()})<br>
                                    🕒 Last Active: \${user.lastActiveFormatted}
                                    \${user.rental.isRental ? \`<br>📅 Expires: \${user.rental.expiresAtFormatted || 'N/A'}\` : ''}
                                </div>
                            </div>
                            \${statusHtml}
                            <div class="user-actions">
                                \${actionsHtml}
                                <a href="/user/\${user.username}/config" class="btn btn-primary btn-sm" target="_blank">
                                    ⚙️ Settings
                                </a>
                            </div>
                        </div>
                    \`;
                });
                
                container.innerHTML = html;
            }
            
            // Convert user to rental
            function convertToRental(username) {
                document.getElementById('convertUsername').value = username;
                showModal('convertModal');
            }
            
            // Extend rental
            function extendRental(username) {
                document.getElementById('extendUsername').value = username;
                showModal('extendModal');
            }
            
            // Show modal
            function showModal(modalId) {
                document.getElementById(modalId).style.display = 'flex';
            }
            
            // Close modal
            function closeModal(modalId) {
                document.getElementById(modalId).style.display = 'none';
            }
            
            // Handle convert form
            document.getElementById('convertForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const username = document.getElementById('convertUsername').value;
                const days = document.getElementById('convertDays').value;
                
                try {
                    const response = await fetch('/api/admin/convert-to-rental', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            username: username,
                            rentalDays: parseInt(days)
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        showNotification('success', \`แปลง \${username} เป็น rental user สำเร็จ!\`);
                        closeModal('convertModal');
                        refreshData();
                    } else {
                        showNotification('error', data.message || 'เกิดข้อผิดพลาด');
                    }
                } catch (error) {
                    console.error('Error converting user:', error);
                    showNotification('error', 'เกิดข้อผิดพลาดในการแปลง user');
                }
            });
            
            // Handle extend form
            document.getElementById('extendForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const username = document.getElementById('extendUsername').value;
                const days = document.getElementById('extendDays').value;
                
                try {
                    const response = await fetch('/api/admin/extend-user-rental', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            username: username,
                            additionalDays: parseInt(days)
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        showNotification('success', \`ต่ออายุ \${username} สำเร็จ!\`);
                        closeModal('extendModal');
                        refreshData();
                    } else {
                        showNotification('error', data.message || 'เกิดข้อผิดพลาด');
                    }
                } catch (error) {
                    console.error('Error extending rental:', error);
                    showNotification('error', 'เกิดข้อผิดพลาดในการต่ออายุ');
                }
            });
            
            // Check expired users
            async function checkExpiredUsers() {
                try {
                    const response = await fetch('/api/admin/check-expired-users');
                    const data = await response.json();
                    
                    if (data.success) {
                        showNotification('success', \`ตรวจสอบเสร็จ: \${data.expired} expired, \${data.aboutToExpire} about to expire\`);
                        refreshData();
                    } else {
                        showNotification('error', 'ไม่สามารถตรวจสอบได้');
                    }
                } catch (error) {
                    console.error('Error checking expired users:', error);
                    showNotification('error', 'เกิดข้อผิดพลาดในการตรวจสอบ');
                }
            }
            
            // Cleanup expired users
            async function cleanupExpiredUsers() {
                if (!confirm('คุณแน่ใจหรือไม่ที่จะลบ users ที่หมดอายุ? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
                    return;
                }
                
                try {
                    const response = await fetch('/api/admin/cleanup-expired-users', {
                        method: 'POST'
                    });
                    const data = await response.json();
                    
                    if (data.success) {
                        showNotification('success', \`ลบ users หมดอายุสำเร็จ: \${data.deletedCount} users\`);
                        refreshData();
                    } else {
                        showNotification('error', 'ไม่สามารถลบได้');
                    }
                } catch (error) {
                    console.error('Error cleaning up expired users:', error);
                    showNotification('error', 'เกิดข้อผิดพลาดในการลบ');
                }
            }
            
            // Show notification
            function showNotification(type, message) {
                const notification = document.getElementById('notification');
                notification.className = \`notification \${type}\`;
                notification.textContent = message;
                notification.classList.add('show');
                
                setTimeout(() => {
                    notification.classList.remove('show');
                }, 3000);
            }
            
            // Close modal when clicking outside
            window.onclick = function(event) {
                const modals = document.querySelectorAll('.modal');
                modals.forEach(modal => {
                    if (event.target === modal) {
                        modal.style.display = 'none';
                    }
                });
            }
        </script>
    </body>
    </html>
    `;
    
    res.send(html);
});

// 🏠 หน้าแรก
app.get('/', (req, res) => {
    try {
        console.log('📄 Rendering homepage...');
        
        const users = userManager.getAllUsers();
        const globalStats = userManager.getGlobalStats();
        
        let usersList = '';
        
        if (users.length === 0) {
            usersList = `
                <div class="empty-state">
                    <div class="icon">🎮</div>
                    <h3>ยังไม่มี Streamers</h3>
                    <p>เป็นคนแรกที่เริ่มใช้ระบบ Alert ของเรา!</p>
                </div>
            `;
        } else {
            usersList = '<div class="streamers-grid">';
            
            users.forEach(user => {
                const isActive = isUserActive(user.lastActiveAt);
                const statusClass = isActive ? 'status-active' : 'status-inactive';
                const statusText = isActive ? 'Online' : 'Offline';
                const avatarLetter = user.username.charAt(0).toUpperCase();
                
                let paymentMethods = [];
                if (user.enableTrueWallet) paymentMethods.push('TrueWallet');
                if (user.enableBankTransfer) paymentMethods.push('โอนธนาคาร');
                if (paymentMethods.length === 0) paymentMethods.push('Manual');
                
                // ตรวจสอบสถานะ rental
                const userData = userManager.loadUserData(user.username);
                let rentalInfo = {
                    isRental: false,
                    isExpired: false,
                    daysLeft: 0
                };
                
                if (userData.rental && userData.rental.isRental) {
                    const now = Date.now();
                    const isExpired = now > userData.rental.expiresAt;
                    const daysLeft = Math.ceil((userData.rental.expiresAt - now) / (24 * 60 * 60 * 1000));
                    
                    rentalInfo = {
                        isRental: true,
                        isExpired: isExpired,
                        daysLeft: isExpired ? 0 : daysLeft
                    };
                }
                
                usersList += `
                    <div class="streamer-card">
                        <div class="card-header">
                            <div class="streamer-info">
                                <div class="avatar">${avatarLetter}</div>
                                <div class="streamer-details">
                                    <h3>${user.username}</h3>
                                    <div class="stream-title">${user.streamTitle}</div>
                                    <div class="payment-methods">💳 ${paymentMethods.join(', ')}</div>
                                    ${rentalInfo.isRental ? 
                                        rentalInfo.isExpired ? 
                                            `<div class="rental-status expired">🚫 หมดอายุแล้ว</div>` :
                                            rentalInfo.daysLeft <= 3 ?
                                                `<div class="rental-status warning">⚠️ เหลือ ${rentalInfo.daysLeft} วัน</div>` :
                                                `<div class="rental-status active">📅 เหลือ ${rentalInfo.daysLeft} วัน</div>`
                                        : ''
                                    }
                                </div>
                            </div>
                            <div class="status-badge ${statusClass}">${statusText}</div>
                        </div>
                        
                        <div class="card-stats">
                            <div class="stat-box">
                                <div class="stat-value">${user.totalDonations}</div>
                                <div class="stat-label">Donations</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-value">฿${user.totalAmount.toLocaleString()}</div>
                                <div class="stat-label">Total</div>
                            </div>
                        </div>
                        
                        <div class="card-actions">
                            <a href="/user/${user.username}/donate" class="action-btn primary">
                                💝 Donate Page
                            </a>
                            <a href="/user/${user.username}/widget" class="action-btn" target="_blank">
                                📺 Widget
                            </a>
                            
                            <div class="more-actions">
                                <a href="/user/${user.username}/control" class="action-btn" target="_blank">
                                    🎮 Alert Test
                                </a>
                                <a href="/user/${user.username}/history" class="action-btn" target="_blank">
                                    📊 History
                                </a>
                                <a href="/user/${user.username}/config" class="action-btn">
                                    ⚙️ Settings
                                </a>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            usersList += '</div>';
        }
        
        console.log('📋 Users HTML length:', usersList.length);
        
        // เพิ่ม logout button และข้อมูล session ใน template
        const html = templateEngine.render('homepage', {
            totalUsers: globalStats.totalUsers,
            totalAmount: globalStats.totalAmount.toLocaleString(),
            totalDonations: globalStats.totalDonations,
            activeUsers: globalStats.activeUsers,
            usersList: usersList
        });
        
        // แทรก logout button ใน header
        const htmlWithLogout = html.replace(
            '<div class="header-stats">',
            `<div class="header-stats">
                <a href="/logout" style="
                    background: rgba(239, 68, 68, 0.2);
                    color: #fca5a5;
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    padding: 8px 16px;
                    border-radius: 12px;
                    text-decoration: none;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.3s ease;
                    margin-right: 20px;
                " onmouseover="this.style.background='rgba(239, 68, 68, 0.3)'" 
                   onmouseout="this.style.background='rgba(239, 68, 68, 0.2)'">
                    🚪 Logout
                </a>`
        );
        
        res.send(htmlWithLogout);
        
    } catch (error) {
        console.error('Error rendering homepage:', error);
        res.status(500).send(`
            <h1>Error</h1>
            <p>เกิดข้อผิดพลาด: ${error.message}</p>
            <p>กรุณาตรวจสอบว่าไฟล์ templates/homepage.html มีอยู่หรือไม่</p>
            <button onclick="history.back()">← กลับไป</button>
        `);
    }
});

// 🆕 สร้าง user ใหม่
app.post('/user/create', async (req, res) => {
    try {
        console.log('📝 Create user request:', req.body);
        
        const { username, phone, rentalDays } = req.body;
        
        if (!username || !phone || !rentalDays) {
            console.log('❌ Missing data:', { username, phone, rentalDays });
            return res.status(400).send(`
                <!DOCTYPE html>
                <html><head><meta charset="UTF-8"><title>Error</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ ข้อมูลไม่ครบถ้วน</h1>
                    <p>กรุณากรอก Username, เบอร์โทรศัพท์ และจำนวนวันให้เช่า</p>
                    <button onclick="history.back()">← กลับไป</button>
                </body></html>
            `);
        }
        
        const usernameValidation = userManager.validateUsername(username);
        if (!usernameValidation.isValid) {
            console.log('❌ Invalid username:', username, usernameValidation.errors);
            return res.status(400).send(`
                <!DOCTYPE html>
                <html><head><meta charset="UTF-8"><title>Error</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ Username ไม่ถูกต้อง</h1>
                    <p>${usernameValidation.errors.join('<br>')}</p>
                    <button onclick="history.back()">← กลับไป</button>
                </body></html>
            `);
        }
        
        if (!/^[0-9]{10}$/.test(phone)) {
            console.log('❌ Invalid phone:', phone);
            return res.status(400).send(`
                <!DOCTYPE html>
                <html><head><meta charset="UTF-8"><title>Error</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ เบอร์โทรศัพท์ไม่ถูกต้อง</h1>
                    <p>เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก</p>
                    <button onclick="history.back()">← กลับไป</button>
                </body></html>
            `);
        }
        
        if (userManager.userExists(username)) {
            console.log('❌ User already exists:', username);
            return res.status(400).send(`
                <!DOCTYPE html>
                <html><head><meta charset="UTF-8"><title>Error</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ Username นี้มีอยู่แล้ว</h1>
                    <p>กรุณาเลือก Username อื่น</p>
                    <button onclick="history.back()">← กลับไป</button>
                </body></html>
            `);
        }
        
        const days = parseInt(rentalDays);
        if (isNaN(days) || days < 1 || days > 365) {
            console.log('❌ Invalid rental days:', rentalDays);
            return res.status(400).send(`
                <!DOCTYPE html>
                <html><head><meta charset="UTF-8"><title>Error</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ จำนวนวันไม่ถูกต้อง</h1>
                    <p>จำนวนวันต้องเป็นตัวเลข 1-365 วัน</p>
                    <button onclick="history.back()">← กลับไป</button>
                </body></html>
            `);
        }

        const result = await userManager.createUser(username, {
            truewalletPhone: phone,
            streamTitle: `${username}'s Stream`,
            rentalDays: days
        });
        
        console.log(`✅ New user created: ${username} with password: ${result.defaultPassword}`);
        
        // แสดงหน้าที่มีรหัสผ่าน
        res.send(`
            <!DOCTYPE html>
            <html lang="th">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>🎉 สร้างบัญชีสำเร็จ</title>
                <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
                <style>
                    body {
                        font-family: 'Kanit', sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0;
                        padding: 20px;
                    }
                    .container {
                        background: rgba(255, 255, 255, 0.1);
                        backdrop-filter: blur(20px);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        border-radius: 20px;
                        padding: 40px;
                        text-align: center;
                        max-width: 500px;
                        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                    }
                    h1 {
                        font-size: 2.5em;
                        margin-bottom: 20px;
                        background: linear-gradient(135deg, #10b981, #34d399);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        background-clip: text;
                    }
                    .username {
                        background: rgba(102, 126, 234, 0.2);
                        color: #667eea;
                        padding: 15px 25px;
                        border-radius: 15px;
                        font-size: 1.5em;
                        font-weight: bold;
                        margin: 20px 0;
                        border: 2px solid rgba(102, 126, 234, 0.3);
                    }
                    .info-section {
                        background: rgba(16, 185, 129, 0.1);
                        border: 2px solid rgba(16, 185, 129, 0.3);
                        border-radius: 15px;
                        padding: 25px;
                        margin: 20px 0;
                        text-align: left;
                    }
                    .info-content {
                        background: rgba(255, 255, 255, 0.1);
                        padding: 20px;
                        border-radius: 10px;
                        font-family: monospace;
                        font-size: 0.85em;
                        line-height: 1.8;
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        white-space: pre-wrap;
                        user-select: all;
                        word-break: break-all;
                    }
                    .copy-btn {
                        background: linear-gradient(135deg, #f59e0b, #f97316);
                        color: white;
                        border: none;
                        padding: 12px 25px;
                        border-radius: 10px;
                        font-weight: 600;
                        font-size: 1em;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        margin: 15px 0;
                        display: block;
                        width: 100%;
                    }
                    .copy-btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 10px 25px rgba(245, 158, 11, 0.3);
                    }
                    .btn {
                        display: inline-block;
                        padding: 15px 30px;
                        background: linear-gradient(135deg, #10b981, #34d399);
                        color: white;
                        text-decoration: none;
                        border-radius: 15px;
                        font-weight: 600;
                        transition: all 0.3s ease;
                        margin: 10px;
                    }
                    .btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 10px 25px rgba(16, 185, 129, 0.3);
                    }
                    .btn.secondary {
                        background: linear-gradient(135deg, #667eea, #764ba2);
                    }
                    .btn.secondary:hover {
                        box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3);
                    }
                    .warning {
                        background: rgba(239, 68, 68, 0.1);
                        border: 1px solid rgba(239, 68, 68, 0.3);
                        border-radius: 10px;
                        padding: 15px;
                        margin: 20px 0;
                        font-size: 0.9em;
                        line-height: 1.5;
                        color: #fca5a5;
                    }
                    .success-message {
                        background: rgba(16, 185, 129, 0.2);
                        border: 1px solid rgba(16, 185, 129, 0.4);
                        color: #34d399;
                        padding: 10px 20px;
                        border-radius: 8px;
                        margin: 10px 0;
                        font-weight: 500;
                        display: none;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🎉 สร้างบัญชีสำเร็จ!</h1>
                    
                    <div class="username">@${username}</div>
                    
                    <div class="info-section">
                        <h3 style="margin-bottom: 15px; text-align: center;">📋 ข้อมูลสำหรับลูกค้า</h3>
                        <div class="info-content" id="customerInfo">ใช้รหัสผ่าน : ${result.defaultPassword}
📅 วันหมดอายุ : ${result.userData.rental.expiresAtFormatted}
📊 จำนวนวันที่เช่า : ${days} วัน
ในการเข้าตั้งค่า : https://chatmateth.chat/user/${username}/config 
หน้าconfig 
https://chatmateth.chat/user/${username}/config
หน้าประวัติ
https://chatmateth.chat/user/${username}/history
หน้าเทส alert 
https://chatmateth.chat/user/${username}/control
หน้าโดเนท
https://chatmateth.chat/user/${username}/donate
ลองใช้งานได้เลยครับ ติดตรงไหนสอบถามได้เลยครับ หากพบปัญหาหรือมีข้อเสนอตรงไหนแจ้งได้เลยครับ</div>
                        <button class="copy-btn" onclick="copyCustomerInfo()">
                            📋 คัดลอกข้อมูลทั้งหมดเพื่อส่งให้ลูกค้า
                        </button>
                        <div class="success-message" id="successMessage">
                            ✅ คัดลอกข้อมูลสำเร็จ! พร้อมส่งให้ลูกค้าแล้ว
                        </div>
                    </div>
                    
                    <div class="warning">
                        ⚠️ <strong>สำคัญ!</strong><br>
                        • คัดลอกข้อมูลข้างบนส่งให้ลูกค้า<br>
                        • รหัสผ่านใช้สำหรับเข้า Config และ History เท่านั้น<br>
                        • หน้า Donate ไม่ต้องใช้รหัสผ่าน<br>
                        • สามารถเปลี่ยนรหัสผ่านได้ในหน้า Settings
                    </div>
                    
                    <div style="margin-top: 30px;">
                        <a href="/user/${username}/config" class="btn">⚙️ ไปที่ Settings</a>
                        <a href="/" class="btn secondary">🏠 กลับหน้าแรก</a>
                    </div>
                </div>
                
                <script>
                    function copyCustomerInfo() {
                        const customerInfo = document.getElementById('customerInfo').textContent;
                        const successMessage = document.getElementById('successMessage');
                        
                        if (navigator.clipboard) {
                            navigator.clipboard.writeText(customerInfo).then(() => {
                                showSuccessMessage(successMessage);
                            }).catch(err => {
                                fallbackCopy(customerInfo, successMessage);
                            });
                        } else {
                            fallbackCopy(customerInfo, successMessage);
                        }
                    }
                    
                    function fallbackCopy(text, successMessage) {
                        const textarea = document.createElement('textarea');
                        textarea.value = text;
                        document.body.appendChild(textarea);
                        textarea.select();
                        try {
                            document.execCommand('copy');
                            showSuccessMessage(successMessage);
                        } catch (err) {
                            alert('กรุณาคัดลอกข้อมูลด้วยตนเอง:\\n\\n' + text);
                        }
                        document.body.removeChild(textarea);
                    }
                    
                    function showSuccessMessage(element) {
                        element.style.display = 'block';
                        setTimeout(() => {
                            element.style.display = 'none';
                        }, 3000);
                    }
                    
                    // Auto select info when click
                    document.getElementById('customerInfo').addEventListener('click', function() {
                        if (window.getSelection) {
                            const selection = window.getSelection();
                            const range = document.createRange();
                            range.selectNodeContents(this);
                            selection.removeAllRanges();
                            selection.addRange(range);
                        }
                    });
                    
                    // เตือนก่อนออกจากหน้า
                    window.addEventListener('beforeunload', function (e) {
                        e.preventDefault();
                        e.returnValue = 'คุณได้คัดลอกข้อมูลส่งให้ลูกค้าแล้วหรือยัง?';
                    });
                </script>
            </body>
            </html>
        `);
        
    } catch (error) {
        console.error('❌ Error creating user:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html><head><meta charset="UTF-8"><title>Error</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>❌ เกิดข้อผิดพลาดในระบบ</h1>
                <p>${error.message}</p>
                <button onclick="history.back()">← กลับไป</button>
            </body></html>
        `);
    }
});

// ===============================
// 🔐 API Key Configuration (เพิ่มใหม่)
// ===============================
const API_KEY = process.env.API_KEY || 'Ba225teW'; // 🔒 เปลี่ยนเป็น key ที่ปลอดภัย

// Middleware ตรวจสอบ API Key
function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.apikey || req.body.apikey;
    
    if (!apiKey) {
        return res.status(401).json({
            success: false,
            error: 'API_KEY_REQUIRED',
            message: 'API Key is required. Use x-api-key header or apikey parameter.'
        });
    }
    
    if (apiKey !== API_KEY) {
        console.log(`❌ Invalid API Key attempt from IP: ${req.ip}`);
        return res.status(401).json({
            success: false,
            error: 'INVALID_API_KEY',
            message: 'Invalid API Key provided.'
        });
    }
    
    console.log(`✅ Valid API Key from IP: ${req.ip}`);
    next();
}

// ===============================
// 🆕 API สร้าง User (Protected with API Key) - เพิ่มใหม่
// ===============================
app.post('/api/user/create', requireApiKey, async (req, res) => {
    try {
        console.log('🔧 API Create user request:', req.body);
        
        // รับพารามิเตอร์
        const { username, walletnumber, day, streamtitle } = req.body;
        
        // ตรวจสอบข้อมูลที่จำเป็น
        if (!username || !walletnumber || !day) {
            console.log('❌ Missing required data:', { username, walletnumber, day });
            return res.status(400).json({
                success: false,
                error: 'MISSING_REQUIRED_DATA',
                message: 'Missing required parameters: username, walletnumber, day',
                required: ['username', 'walletnumber', 'day'],
                optional: ['streamtitle', 'apikey']
            });
        }
        
        // ตรวจสอบ username
        const usernameValidation = userManager.validateUsername(username);
        if (!usernameValidation.isValid) {
            console.log('❌ Invalid username:', username, usernameValidation.errors);
            return res.status(400).json({
                success: false,
                error: 'INVALID_USERNAME',
                message: 'Invalid username format',
                details: usernameValidation.errors,
                rules: 'Username must be 3-20 characters (letters, numbers, _, -)'
            });
        }
        
        // ตรวจสอบเบอร์ TrueWallet
        if (!/^[0-9]{10}$/.test(walletnumber)) {
            console.log('❌ Invalid wallet number:', walletnumber);
            return res.status(400).json({
                success: false,
                error: 'INVALID_WALLET_NUMBER',
                message: 'Wallet number must be 10 digits',
                example: '0812345678'
            });
        }
        
        // ตรวจสอบว่า user มีอยู่แล้วหรือไม่
        if (userManager.userExists(username)) {
            console.log('❌ User already exists:', username);
            return res.status(409).json({
                success: false,
                error: 'USER_EXISTS',
                message: `User '${username}' already exists`,
                suggestion: 'Please choose a different username'
            });
        }
        
        // ตรวจสอบจำนวนวัน
        const days = parseInt(day);
        if (isNaN(days) || days < 1 || days > 365) {
            console.log('❌ Invalid rental days:', day);
            return res.status(400).json({
                success: false,
                error: 'INVALID_DAY_COUNT',
                message: 'Day count must be between 1-365',
                provided: day,
                range: { min: 1, max: 365 }
            });
        }

        // สร้าง user ด้วยฟังก์ชันเดียวกันกับหน้าเว็บ
        const result = await userManager.createUser(username, {
            truewalletPhone: walletnumber,
            streamTitle: streamtitle || `${username}'s Stream`,
            rentalDays: days
        });
        
        console.log(`✅ API: New user created: ${username} with password: ${result.defaultPassword}`);
        
        // ส่งข้อมูลกลับในรูปแบบ JSON
        const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        const response = {
            success: true,
            message: 'User created successfully',
            data: {
                username: username,
                password: result.defaultPassword,
                streamTitle: result.userData.config.streamTitle,
                walletNumber: walletnumber,
                rentalDays: days,
                expiresAt: result.userData.rental.expiresAt,
                expiresAtFormatted: result.userData.rental.expiresAtFormatted,
                createdAt: result.userData.createdAt,
                
                // URLs สำหรับใช้งาน
                urls: {
                    config: `${protocol}://${req.get('host')}/user/${username}/config`,
                    history: `${protocol}://${req.get('host')}/user/${username}/history`,
                    control: `${protocol}://${req.get('host')}/user/${username}/control`,
                    donate: `${protocol}://${req.get('host')}/user/${username}/donate`,
                    widget: `${protocol}://${req.get('host')}/user/${username}/widget`
                }
            },
            
            // ข้อมูลสำหรับส่งลูกค้า (เหมือนหน้าเว็บ)
            customerInfo: {
                copyText: `ใช้รหัสผ่าน : ${result.defaultPassword}\n📅 วันหมดอายุ : ${result.userData.rental.expiresAtFormatted}\n📊 จำนวนวันที่เช่า : ${days} วัน\nในการเข้าตั้งค่า : ${protocol}://${req.get('host')}/user/${username}/config\nหน้าconfig\n${protocol}://${req.get('host')}/user/${username}/config\nหน้าประวัติ\n${protocol}://${req.get('host')}/user/${username}/history\nหน้าเทส alert\n${protocol}://${req.get('host')}/user/${username}/control\nหน้าโดเนท\n${protocol}://${req.get('host')}/user/${username}/donate\nลองใช้งานได้เลยครับ ติดตรงไหนสอบถามได้เลยครับ หากพบปัญหาหรือมีข้อเสนอตรงไหนแจ้งได้เลยครับ`
            }
        };
        
        res.status(201).json(response);
        
    } catch (error) {
        console.error('❌ API Error creating user:', error);
        res.status(500).json({
            success: false,
            error: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create user',
            details: error.message
        });
    }
});

// ===============================
// 🔍 API ตรวจสอบสถานะ API Key (เพิ่มใหม่)
// ===============================
app.get('/api/auth/check', requireApiKey, (req, res) => {
    res.json({
        success: true,
        message: 'API Key is valid',
        timestamp: new Date().toISOString(),
        ip: req.ip
    });
});


// 💝 หน้าโดเนท
app.get('/user/:username/donate', (req, res) => {
    try {
        console.log(`📄 Rendering donate page for: ${req.username}`);
        
        const html = templateEngine.render('donate', {
            username: req.username,
            streamTitle: req.userData.config.streamTitle,
            totalDonations: req.userData.stats.totalDonations,
            totalAmount: req.userData.stats.totalAmount.toLocaleString()
        });
        
        res.send(html);
        
    } catch (error) {
        console.error('Error rendering donate page:', error);
        res.status(500).send(`
            <h1>Error</h1>
            <p>ไม่สามารถแสดงหน้าโดเนทได้: ${error.message}</p>
            <p>กรุณาตรวจสอบว่าไฟล์ templates/donate.html มีอยู่หรือไม่</p>
            <button onclick="history.back()">← กลับไป</button>
        `);
    }
});

// 📺 Alert Widget
app.get('/user/:username/widget', (req, res) => {
    try {
        console.log(`📄 Rendering widget for: ${req.username}`);
        
        const config = req.userData.config;
        
        const html = templateEngine.render('widget', {
            username: req.username,
            streamTitle: config.streamTitle || `${req.username}'s Stream`,
            alertDuration: config.alertDuration || 5000,
            enableTTS: config.enableTTS ? 'true' : 'false',
            enableTTSName: config.enableTTSName !== false ? 'true' : 'false',
            enableTTSMessage: config.enableTTSMessage !== false ? 'true' : 'false',
            enableSound: config.enableSound ? 'true' : 'false',
            minTTSAmount: config.minTTSAmount || 50,
            alertFormat: (config.alertFormat || '{{user}} โดเนท {{amount}}').replace(/"/g, '\\"'),
            showBackground: (config.showBackground === true) ? 'true' : 'false',
            showIcon: (config.showIcon !== false) ? 'true' : 'false',
            showSparkles: (config.showSparkles !== false) ? 'true' : 'false',
            useCustomGif: config.useCustomGif ? 'true' : 'false',
            customGifUrl: config.customGifUrl || '',
            backgroundColor: config.backgroundColor || 'rgba(255, 255, 255, 0.95)',
            textColor: config.textColor || '#1f2937',
            amountColor: config.amountColor || '#f59e0b',
            donorColor: config.donorColor || '#667eea',
            messageColor: config.messageColor || '#6b7280',
            fontSize: config.fontSize || 42,
            amountSize: config.amountSize || 56,
            messageSize: config.messageSize || 24,
            borderRadius: config.borderRadius || 25,
            animationSpeed: config.animationSpeed || 1.2,
            customCSS: config.customCSS || ''
        });
        
        res.send(html);
        
    } catch (error) {
        console.error('Error rendering widget:', error);
        res.status(500).send(`
            <h1>Widget Error</h1>
            <p>ไม่สามารถแสดง Widget ได้: ${error.message}</p>
            <p>Debug info: ${JSON.stringify({
                username: req.username,
                configExists: !!req.userData,
                configKeys: req.userData ? Object.keys(req.userData.config) : 'none'
            })}</p>
        `);
    }
});

// ⚙️ Config/Settings - 🔧 Enhanced with Domain Support
app.get('/user/:username/config', requireUserAuth, (req, res) => {
    try {
        console.log(`📄 Loading config page for: ${req.username}`);
        
        const isNewUser = req.query.created === 'true';
        // 🔧 Enhanced Protocol Detection with Domain Support
        const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        
        // 🔧 Enhanced URL Generation with Domain Support
        const widgetUrl = `${protocol}://${req.get('host')}/user/${req.username}/widget`;
        const donateUrl = `${protocol}://${req.get('host')}/user/${req.username}/donate`;
        
        console.log(`🔗 URLs:`, { widgetUrl, donateUrl });
        console.log(`⚙️ Current config:`, req.userData.config);
        
        // ส่ง config ที่ escape quotes ให้ถูกต้อง
        const configForTemplate = JSON.stringify(req.userData.config).replace(/"/g, '&quot;');
        
        const html = templateEngine.render('config', {
            username: req.username,
            config: configForTemplate,
            isNewUser: isNewUser ? 'block' : 'none',
            widgetUrl: widgetUrl,
            donateUrl: donateUrl
        });
        
        res.send(html);
        
    } catch (error) {
        console.error(`❌ Error rendering config page for ${req.username}:`, error);
        res.status(500).send(`
            <h1>Config Error</h1>
            <p>ไม่สามารถแสดงหน้า Settings ได้: ${error.message}</p>
            <p>กรุณาตรวจสอบว่าไฟล์ templates/config.html มีอยู่หรือไม่</p>
            <button onclick="history.back()">← กลับไป</button>
        `);
    }
});

// 🎮 Control Panel
app.get('/user/:username/control', (req, res) => {
    try {
        console.log(`📄 Rendering control panel for: ${req.username}`);
        
        const html = templateEngine.render('control', {
            username: req.username,
            streamTitle: req.userData.config.streamTitle,
            totalDonations: req.userData.stats.totalDonations,
            totalAmount: req.userData.stats.totalAmount.toLocaleString(),
            recentDonations: JSON.stringify(req.userData.donations.slice(0, 10))
        });
        
        res.send(html);
        
    } catch (error) {
        console.error('Error rendering control panel:', error);
        res.status(500).send(`
            <h1>Control Panel Error</h1>
            <p>ไม่สามารถแสดง Control Panel ได้: ${error.message}</p>
            <p>กรุณาตรวจสอบว่าไฟล์ templates/control.html มีอยู่หรือไม่</p>
            <button onclick="history.back()">← กลับไป</button>
        `);
    }
});

// 📊 History Dashboard
app.get('/user/:username/history', requireUserAuth, (req, res) => {
    try {
        console.log(`📄 Rendering history for: ${req.username}`);
        
        const html = templateEngine.render('history', {
            username: req.username,
            streamTitle: req.userData.config.streamTitle,
            totalDonations: req.userData.stats.totalDonations,
            totalAmount: req.userData.stats.totalAmount.toLocaleString(),
            averageAmount: req.userData.stats.averageAmount,
            uniqueDonors: req.userData.stats.uniqueDonors
        });
        
        res.send(html);
        
    } catch (error) {
        console.error('Error rendering history:', error);
        res.status(500).send(`
            <h1>History Error</h1>
            <p>ไม่สามารถแสดงหน้า History ได้: ${error.message}</p>
            <p>กรุณาตรวจสอบว่าไฟล์ templates/history.html มีอยู่หรือไม่</p>
            <button onclick="history.back()">← กลับไป</button>
        `);
    }
});

// ===============================
// API Routes
// ===============================

// 💰 API เติมเงิน TrueWallet
app.post('/user/:username/api/redeem-voucher', async (req, res) => {
    try {
        const { voucher_code, donor_name, donor_message } = req.body;
        const phoneNumber = req.userData.config.truewalletPhone;
        
        if (!phoneNumber) {
            return res.status(400).json({
                status: 'FAIL',
                reason: 'ยังไม่ได้ตั้งค่าเบอร์ TrueWallet กรุณาไปที่หน้า Settings'
            });
        }
        
        if (!voucher_code) {
            return res.status(400).json({
                status: 'FAIL',
                reason: 'กรุณากรอกรหัส voucher'
            });
        }
        
        console.log(`🔄 [${req.username}] กำลังเติมเงินด้วย voucher: ${voucher_code.substring(0, 10)}...`);
        
        if (!truewallet) {
            return res.status(500).json({
                status: 'ERROR',
                reason: 'TrueWallet API ไม่พร้อมใช้งาน'
            });
        }
        
        const result = await truewallet.redeemvouchers(phoneNumber, voucher_code);
        
        if (result.status === 'SUCCESS') {
            console.log(`✅ [${req.username}] เติมเงินสำเร็จ: ${result.amount} บาท`);
            
            if (donor_name) {
                const donationData = {
                    name: donor_name,
                    amount: parseInt(result.amount),
                    message: donor_message || '',
                    paymentMethod: 'truewallet',
                    voucherCode: voucher_code,
                    phoneNumber: phoneNumber,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                };
                
                const donation = userManager.addDonation(req.username, donationData);
                
                io.to(`user-${req.username}`).emit('new-alert', {
                    id: donation.id,
                    name: donation.name,
                    amount: donation.amount,
                    message: donation.message,
                    timestamp: donation.timestamp
                });
                
                console.log(`🎉 [${req.username}] Donation alert sent:`, donation);
            }
        } else {
            console.log(`❌ [${req.username}] เติมเงินไม่สำเร็จ: ${result.reason}`);
        }
        
        res.json(result);
        
    } catch (error) {
        console.error(`❌ [${req.username}] Error in voucher redemption:`, error);
        res.status(500).json({
            status: 'ERROR',
            reason: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง'
        });
    }
});

// 🏦 API ตรวจสอบสลิปธนาคาร - Enhanced Version (Auto Amount Detection)
app.post('/user/:username/api/verify-slip', async (req, res) => {
    try {
        const { payload, expected_amount, donor_name, donor_message } = req.body;
        const userData = req.userData;
        
        console.log(`🔍 [${req.username}] Verifying bank slip with enhanced validation...`);
        
        // ตรวจสอบว่าเปิดใช้งานโอนธนาคารหรือไม่
        if (!userData.config.enableBankTransfer) {
            return res.status(400).json({
                success: false,
                reason: 'ระบบโอนธนาคารยังไม่เปิดใช้งาน'
            });
        }

        // ตรวจสอบการตั้งค่าธนาคาร
        const bankValidation = userManager.validateBankSettings(req.username);
        if (!bankValidation.isValid) {
            return res.status(400).json({
                success: false,
                reason: 'การตั้งค่าธนาคารไม่ถูกต้อง: ' + bankValidation.errors.join(', ')
            });
        }

        if (!payload || !donor_name) {
            return res.status(400).json({
                success: false,
                reason: 'ข้อมูลไม่ครบถ้วน'
            });
        }

        console.log(`🔄 [${req.username}] Calling slip verification API...`);

        // เรียก API ตรวจสอบสลิป
        const verifyResponse = await fetch('https://suba.rdcw.co.th/v1/inquiry', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${SLIP_CLIENT_ID}:${SLIP_CLIENT_SECRET}`).toString('base64')
            },
            body: JSON.stringify({ payload })
        });

        if (!verifyResponse.ok) {
            console.error(`❌ [${req.username}] Slip API error:`, verifyResponse.status);
            return res.status(500).json({
                success: false,
                reason: 'ไม่สามารถเชื่อมต่อกับระบบตรวจสอบสลิปได้'
            });
        }

        const slipData = await verifyResponse.json();
        console.log(`📋 [${req.username}] Slip verification result:`, {
            valid: slipData.valid,
            amount: slipData.data?.amount,
            receiver: slipData.data?.receiver?.account?.value,
            transRef: slipData.data?.transRef
        });

        // ตรวจสอบความถูกต้องของสลิป
        if (!slipData.valid) {
            return res.json({
                success: false,
                reason: 'สลิปการโอนเงินไม่ถูกต้อง'
            });
        }

        // ดึงจำนวนเงินจากสลิป
        const actualAmount = slipData.data?.amount;
        if (!actualAmount || actualAmount <= 0) {
            return res.json({
                success: false,
                reason: 'ไม่สามารถอ่านจำนวนเงินจากสลิปได้'
            });
        }

        // ตรวจสอบ transaction ซ้ำก่อน (ใช้ transRef และ discriminator)
        const transactionRef = slipData.data?.transRef;
        const discriminator = slipData.discriminator;
        
        if (transactionRef && userManager.isDuplicateTransaction(req.username, transactionRef)) {
            console.log(`❌ [${req.username}] Duplicate transaction ref: ${transactionRef}`);
            return res.json({
                success: false,
                reason: 'สลิปนี้เคยใช้งานแล้ว (Transaction Reference ซ้ำ)'
            });
        }

        if (discriminator && userManager.isDuplicateDiscriminator(req.username, discriminator)) {
            console.log(`❌ [${req.username}] Duplicate discriminator: ${discriminator}`);
            return res.json({
                success: false,
                reason: 'สลิปนี้เคยใช้งานแล้ว (Discriminator ซ้ำ)'
            });
        }

        // ตรวจสอบบัญชีผู้รับด้วย Enhanced Pattern Validation
        const receiverAccount = slipData.data?.receiver?.account?.value;
        const userBankAccount = userData.config.bankAccount;
        
        console.log(`🔍 [${req.username}] Starting enhanced bank account validation...`);
        console.log(`📋 User Account: ${userBankAccount}`);
        console.log(`📋 API Account Pattern: ${receiverAccount}`);
        
        if (!validateBankAccountPattern(userBankAccount, receiverAccount)) {
            console.log(`❌ [${req.username}] Enhanced account validation failed`);
            return res.json({
                success: false,
                reason: 'บัญชีผู้รับเงินไม่ถูกต้อง - ไม่ตรงกับการตั้งค่า'
            });
        }

        console.log(`✅ [${req.username}] Enhanced account validation passed!`);

        // ตรวจสอบจำนวนเงินกับ expected_amount (ถ้ามี)
        if (expected_amount && actualAmount !== expected_amount) {
            console.log(`❌ [${req.username}] Amount mismatch: expected ${expected_amount}, got ${actualAmount}`);
            return res.json({
                success: false,
                reason: `จำนวนเงินไม่ตรงกัน คาดหวัง ฿${expected_amount} แต่พบ ฿${actualAmount}`
            });
        }

        console.log(`✅ [${req.username}] Bank slip verified successfully with auto amount detection: ฿${actualAmount}`);

        // บันทึกการโดเนท
        const donationData = {
            name: donor_name,
            amount: parseInt(actualAmount),
            message: donor_message || '',
            paymentMethod: 'bank_transfer',
            bankName: userData.config.bankName,
            bankAccount: userData.config.bankAccount,
            transactionRef: transactionRef,
            discriminator: discriminator, // เพิ่มการเก็บ discriminator
            slipData: {
                sender: slipData.data?.sender,
                receiver: slipData.data?.receiver,
                transDate: slipData.data?.transDate,
                transTime: slipData.data?.transTime,
                sendingBank: slipData.data?.sendingBank,
                receivingBank: slipData.data?.receivingBank
            },
            ip: req.ip,
            userAgent: req.get('User-Agent')
        };

        const donation = userManager.addDonation(req.username, donationData);

        // ส่ง alert แจ้งเตือน
        io.to(`user-${req.username}`).emit('new-alert', {
            id: donation.id,
            name: donation.name,
            amount: donation.amount,
            message: donation.message,
            timestamp: donation.timestamp
        });

        console.log(`🎉 [${req.username}] Auto-amount bank donation alert sent:`, donation);

        res.json({
            success: true,
            donation: donation,
            verified_amount: actualAmount,
            auto_detected: true, // ระบุว่าเป็นการตรวจหาจำนวนเงินอัตโนมัติ
            transaction_info: {
                transRef: transactionRef,
                transDate: slipData.data?.transDate,
                transTime: slipData.data?.transTime,
                sendingBank: slipData.data?.sendingBank
            }
        });

    } catch (error) {
        console.error(`❌ [${req.username}] Error in auto-amount bank slip verification:`, error);
        res.status(500).json({
            success: false,
            reason: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง'
        });
    }
});

app.get('/user/:username/api/used-slips', (req, res) => {
    try {
        const userData = userManager.loadUserData(req.username);
        const bankDonations = userData.donations.filter(d => d.paymentMethod === 'bank_transfer');
        
        const usedSlips = bankDonations.map(donation => ({
            id: donation.id,
            transactionRef: donation.transactionRef,
            discriminator: donation.discriminator,
            amount: donation.amount,
            name: donation.name,
            timestamp: donation.timestamp,
            bangkokTime: donation.bangkokTime
        }));
        
        res.json({
            success: true,
            total: usedSlips.length,
            data: usedSlips.slice(0, 100) // แสดง 100 รายการล่าสุด
        });
        
    } catch (error) {
        console.error(`Error getting used slips for ${req.username}:`, error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.get('/user/:username/api/bank-info', (req, res) => {
    try {
        const userData = userManager.loadUserData(req.username);
        
        // ส่งเฉพาะข้อมูลธนาคารที่จำเป็นสำหรับหน้า donate
        const bankInfo = {
            enableBankTransfer: userData.config.enableBankTransfer,
            bankName: userData.config.bankName || '',
            bankAccount: userData.config.bankAccount || '',
            bankAccountName: userData.config.bankAccountName || ''
        };
        
        // ซ่อนข้อมูลธนาคารถ้าไม่ได้เปิดใช้งาน
        if (!bankInfo.enableBankTransfer) {
            bankInfo.bankName = '';
            bankInfo.bankAccount = '';
            bankInfo.bankAccountName = '';
        }
        
        res.json({ 
            success: true, 
            config: bankInfo 
        });
        
    } catch (error) {
        console.error(`Error getting bank info for ${req.username}:`, error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// เพิ่ม API สำหรับ admin ดูสถิติการใช้สลิป
app.get('/api/admin/slip-usage-stats', (req, res) => {
    try {
        const users = userManager.getAllUsers();
        let totalSlips = 0;
        let uniqueTransRefs = new Set();
        let uniqueDiscriminators = new Set();
        
        users.forEach(user => {
            const userData = userManager.loadUserData(user.username);
            const bankDonations = userData.donations.filter(d => d.paymentMethod === 'bank_transfer');
            
            bankDonations.forEach(donation => {
                totalSlips++;
                if (donation.transactionRef) {
                    uniqueTransRefs.add(donation.transactionRef);
                }
                if (donation.discriminator) {
                    uniqueDiscriminators.add(donation.discriminator);
                }
            });
        });
        
        res.json({
            success: true,
            stats: {
                totalBankTransfers: totalSlips,
                uniqueTransactionRefs: uniqueTransRefs.size,
                uniqueDiscriminators: uniqueDiscriminators.size,
                duplicateAttempts: {
                    transRefs: totalSlips - uniqueTransRefs.size,
                    discriminators: totalSlips - uniqueDiscriminators.size
                }
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔍 API ทดสอบการเชื่อมต่อ slip verification
app.get('/user/:username/api/test-slip-connection', async (req, res) => {
    try {
        const testResponse = await fetch('https://suba.rdcw.co.th/v1/inquiry', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${SLIP_CLIENT_ID}:${SLIP_CLIENT_SECRET}`).toString('base64')
            },
            body: JSON.stringify({ payload: 'test' })
        });

        res.json({
            success: true,
            status: testResponse.status,
            connected: testResponse.ok,
            message: testResponse.ok ? 'เชื่อมต่อ API สำเร็จ' : 'ไม่สามารถเชื่อมต่อ API ได้'
        });

    } catch (error) {
        console.error('Slip API connection test failed:', error);
        res.status(500).json({
            success: false,
            message: 'ไม่สามารถทดสอบการเชื่อมต่อได้',
            error: error.message
        });
    }
});

// 🧪 API ทดสอบ Enhanced Bank Validation
app.post('/user/:username/api/test-bank-validation', async (req, res) => {
    try {
        const { userAccount, apiPattern } = req.body;
        
        if (!userAccount || !apiPattern) {
            return res.status(400).json({
                success: false,
                message: 'กรุณาระบุ userAccount และ apiPattern'
            });
        }
        
        const result = validateBankAccountPattern(userAccount, apiPattern);
        
        res.json({
            success: true,
            userAccount: userAccount,
            apiPattern: apiPattern,
            validationResult: result,
            message: result ? 'ผ่านการตรวจสอบ' : 'ไม่ผ่านการตรวจสอบ'
        });
        
    } catch (error) {
        console.error('Error testing bank validation:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการทดสอบ',
            error: error.message
        });
    }
});

// ⚙️ API อัพเดท config
app.post('/user/:username/api/config', requireUserAuth, (req, res) => {
    try {
        const updatedConfig = userManager.updateConfig(req.username, req.body);
        res.json({ 
            success: true, 
            message: 'Configuration updated successfully',
            config: updatedConfig 
        });
    } catch (error) {
        console.error(`Error updating config for ${req.username}:`, error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// ⚙️ API ดึง config
app.get('/user/:username/api/config', requireUserAuth, (req, res) => {
    try {
        const userData = userManager.loadUserData(req.username);
        res.json({ 
            success: true, 
            config: userData.config 
        });
    } catch (error) {
        console.error(`Error getting config for ${req.username}:`, error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// 📊 API ดู donation logs
app.get('/user/:username/api/donations', requireUserAuth, (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', dateFrom, dateTo, paymentMethod } = req.query;
        
        // สร้าง criteria สำหรับการค้นหา
        const criteria = {
            search: search,
            dateFrom: dateFrom,
            dateTo: dateTo,
            paymentMethod: paymentMethod
        };

        // ลบ criteria ที่ว่าง
        Object.keys(criteria).forEach(key => {
            if (!criteria[key]) delete criteria[key];
        });

        let donations = userManager.searchDonations(req.username, criteria);
        
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedDonations = donations.slice(startIndex, endIndex);
        
        // คำนวณสถิติสำหรับ search results
        const searchStats = {
            totalDonations: donations.length,
            totalAmount: donations.reduce((sum, d) => sum + d.amount, 0),
            averageAmount: donations.length > 0 ? 
                Math.round(donations.reduce((sum, d) => sum + d.amount, 0) / donations.length) : 0
        };
        
        // 🔧 แก้ไขการคำนวณสถิติวันนี้ให้ใช้ Thailand timezone
        const now = new Date();
        
        // สร้างวันที่เริ่มต้นของวันนี้ในเขตเวลาไทย
        const bangkokTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Bangkok"}));
        const todayStart = new Date(bangkokTime.getFullYear(), bangkokTime.getMonth(), bangkokTime.getDate());
        const todayEnd = new Date(todayStart.getTime() + (24 * 60 * 60 * 1000) - 1);
        
        console.log(`🔍 Today range (Bangkok): ${todayStart.toISOString()} to ${todayEnd.toISOString()}`);
        
        // กรองข้อมูลวันนี้
        const todayDonations = req.userData.donations.filter(d => {
            const donationTime = new Date(d.timestamp);
            const isToday = donationTime >= todayStart && donationTime <= todayEnd;
            
            if (isToday) {
                console.log(`📊 Today donation: ${d.name} - ฿${d.amount} at ${d.bangkokTime}`);
            }
            
            return isToday;
        });
        
        const todayAmount = todayDonations.reduce((sum, d) => sum + d.amount, 0);
        
        console.log(`📊 Today stats: ${todayDonations.length} donations, ฿${todayAmount}`);
        
        const userStats = {
            ...req.userData.stats,
            todayDonations: todayDonations.length,
            todayAmount: todayAmount // เพิ่มจำนวนเงินวันนี้
        };
        
        res.json({
            success: true,
            data: paginatedDonations,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: donations.length,
                pages: Math.ceil(donations.length / limit)
            },
            stats: searchStats,
            userStats: userStats
        });
        
    } catch (error) {
        console.error(`Error fetching donations for ${req.username}:`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch donations',
            error: error.message
        });
    }
});

// 📊 API สถิติการโดเนทแยกตามประเภท
app.get('/user/:username/api/donation-stats', (req, res) => {
    try {
        const stats = userManager.getDonationStatsByMethod(req.username);
        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        console.error(`Error getting donation stats for ${req.username}:`, error);
        res.status(500).json({
            success: false,
            message: 'ไม่สามารถดึงสถิติได้'
        });
    }
});

// 📥 API export donations
app.get('/user/:username/api/donations/export', requireUserAuth, (req, res) => {
    try {
        const { format = 'json' } = req.query;
        
        if (format === 'csv') {
            const exportResult = userManager.exportToCSV(req.username, req.query);
            
            if (exportResult.success) {
                res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
                res.setHeader('Content-Type', 'text/csv');
                res.send(exportResult.content);
            } else {
                res.status(500).json({
                    success: false,
                    message: exportResult.error
                });
            }
        } else {
            // Default JSON export
            const donations = req.userData.donations;
            const filename = `${req.username}_donations_${new Date().toISOString().split('T')[0]}.json`;
            
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({
                username: req.username,
                exportDate: new Date().toISOString(),
                stats: req.userData.stats,
                donations: donations
            }, null, 2));
        }
        
    } catch (error) {
        console.error(`Error exporting donations for ${req.username}:`, error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// 📥 API import donations
app.post('/user/:username/api/donations/import', (req, res) => {
    try {
        const { csvContent } = req.body;
        
        if (!csvContent) {
            return res.status(400).json({
                success: false,
                message: 'CSV content is required'
            });
        }
        
        const importResult = userManager.importFromCSV(req.username, csvContent);
        res.json(importResult);
        
    } catch (error) {
        console.error(`Error importing donations for ${req.username}:`, error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔊 API TTS
app.get('/api/tts', async (req, res) => {
    const { text, lang = 'th' } = req.query;
    
    if (!text) {
        return res.status(400).json({ 
            success: false, 
            message: 'Text parameter is required' 
        });
    }
    
    try {
        console.log('🔊 TTS Request:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));
        
        const encodedText = encodeURIComponent(text);
        const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodedText}`;
        
        const googleReq = https.get(googleUrl, (googleRes) => {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            
            googleRes.pipe(res);
            console.log('✅ TTS served successfully');
        });
        
        googleReq.on('error', (error) => {
            console.error('❌ Google TTS Error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to fetch TTS audio' 
            });
        });
        
        googleReq.setTimeout(10000, () => {
            googleReq.destroy();
            res.status(408).json({ 
                success: false, 
                message: 'TTS request timeout' 
            });
        });
        
    } catch (error) {
        console.error('❌ TTS API Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// 🏥 Health check - 🔧 Enhanced with Domain Info
app.get('/health', (req, res) => {
    const health = userManager.getSystemHealth();
    // 🔧 Enhanced Protocol Detection with Domain Support
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    
    res.json({
        status: health.status === 'healthy' ? 'OK' : 'ERROR',
        message: 'Multi-User Alert System with Enhanced Bank Transfer and Domain Support',
        timestamp: new Date().toISOString(),
        // 🔧 เพิ่ม Domain Info ใน Health Check
        domain: DOMAIN,
        protocol: protocol,
        httpsEnabled: USE_HTTPS,
        uptime: process.uptime(),
        features: {
            truewallet: !!truewallet,
            bankTransfer: true,
            slipVerification: true,
            enhancedBankValidation: true,
            domainSupport: true // 🔧 เพิ่ม domain support flag
        },
        health: health
    });
});

// 📊 API สถานะ server - 🔧 Enhanced with Domain Info
app.get('/api/status', (req, res) => {
    const globalStats = userManager.getGlobalStats();
    const systemHealth = userManager.getSystemHealth();
    // 🔧 Enhanced Protocol Detection with Domain Support
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    
    res.json({
        success: true,
        server: 'Multi-User Alert System with Enhanced Bank Transfer and Domain Support',
        version: '2.3.0', // 🔧 เพิ่ม version สำหรับ domain support
        // 🔧 เพิ่ม Domain Info ใน API Status
        domain: DOMAIN,
        protocol: protocol,
        httpsEnabled: USE_HTTPS,
        uptime: process.uptime(),
        connections: io.engine.clientsCount,
        features: {
            truewallet: !!truewallet,
            bankTransfer: true,
            slipVerification: true,
            enhancedBankValidation: true,
            domainSupport: true // 🔧 เพิ่ม domain support flag
        },
        ...globalStats,
        systemHealth: systemHealth,
        timestamp: new Date().toISOString()
    });
});

// 🔧 API สำหรับ admin (ถ้าต้องการ)
app.get('/api/admin/system-health', (req, res) => {
    try {
        const health = userManager.getSystemHealth();
        res.json({
            success: true,
            health: health
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🔍 API ตรวจสอบ expired users
app.get('/api/admin/check-expired-users', (req, res) => {
    try {
        const result = userManager.checkExpiredUsers();
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🗑️ API ลบ expired users
app.post('/api/admin/cleanup-expired-users', (req, res) => {
    try {
        const result = userManager.cleanupExpiredUsers();
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🆕 API เปลี่ยน user ธรรมดาเป็น rental user
app.post('/api/admin/convert-to-rental', (req, res) => {
    try {
        const { username, rentalDays } = req.body;
        
        if (!username || !rentalDays) {
            return res.status(400).json({
                success: false,
                message: 'Username and rentalDays are required'
            });
        }
        
        if (!userManager.userExists(username)) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const userData = userManager.loadUserData(username);
        const days = parseInt(rentalDays);
        
        if (isNaN(days) || days < 1 || days > 365) {
            return res.status(400).json({
                success: false,
                message: 'จำนวนวันต้องเป็น 1-365 วัน'
            });
        }
        
        // คำนวณวันหมดอายุ
        const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);
        
        // เปลี่ยนเป็น rental user
        userData.rental = {
            isRental: true,
            rentalDays: days,
            expiresAt: expiresAt,
            expiresAtFormatted: new Date(expiresAt).toLocaleString('th-TH', {
                timeZone: 'Asia/Bangkok',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }),
            isExpired: false,
            createdAt: Date.now(),
            convertedAt: Date.now()
        };
        
        userManager.saveUserData(username, userData);
        
        console.log(`🔄 Converted user ${username} to rental: ${days} days`);
        
        res.json({
            success: true,
            message: `แปลง ${username} เป็น rental user สำเร็จ`,
            username: username,
            rentalDays: days,
            expiresAt: expiresAt,
            expiresAtFormatted: userData.rental.expiresAtFormatted
        });
        
    } catch (error) {
        console.error('Error converting user to rental:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 📋 API ดึงรายชื่อ users สำหรับ admin
app.get('/api/admin/users', (req, res) => {
    try {
        const users = userManager.getAllUsers();
        const detailedUsers = users.map(user => {
            const userData = userManager.loadUserData(user.username);
            
            let rentalInfo = {
                isRental: false,
                isExpired: false,
                daysLeft: 0,
                expiresAtFormatted: null
            };
            
            if (userData.rental && userData.rental.isRental) {
                const now = Date.now();
                const isExpired = now > userData.rental.expiresAt;
                const daysLeft = Math.ceil((userData.rental.expiresAt - now) / (24 * 60 * 60 * 1000));
                
                rentalInfo = {
                    isRental: true,
                    isExpired: isExpired,
                    daysLeft: isExpired ? 0 : daysLeft,
                    expiresAtFormatted: userData.rental.expiresAtFormatted
                };
            }
            
            return {
                ...user,
                rental: rentalInfo,
                lastActiveFormatted: new Date(user.lastActiveAt).toLocaleString('th-TH', {
                    timeZone: 'Asia/Bangkok',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })
            };
        });
        
        res.json({
            success: true,
            users: detailedUsers
        });
        
    } catch (error) {
        console.error('Error getting users for admin:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
// 📅 API ต่ออายุ user
app.post('/api/admin/extend-user-rental', (req, res) => {
    try {
        const { username, additionalDays } = req.body;
        
        if (!username || !additionalDays) {
            return res.status(400).json({
                success: false,
                message: 'Username and additionalDays are required'
            });
        }
        
        const result = userManager.extendUserRental(username, parseInt(additionalDays));
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 🧹 API สำหรับ cleanup ข้อมูลเก่า
app.post('/api/admin/cleanup', (req, res) => {
    try {
        const { daysOld = 365 } = req.body;
        const result = userManager.cleanupOldData(daysOld);
        
        res.json({
            success: true,
            message: `Cleanup completed: ${result.cleanedDonations} donations removed from ${result.cleanedUsers} users`,
            result: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 💾 API สำหรับ backup
app.post('/api/admin/backup', (req, res) => {
    try {
        const backupPath = userManager.backupAllUsers();
        
        if (backupPath) {
            res.json({
                success: true,
                message: 'Backup created successfully',
                backupPath: backupPath
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to create backup'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ===============================
// User Login Routes
// ===============================

// หน้า Login สำหรับ User
app.get('/user/:username/login', (req, res) => {
    const username = req.username;
    const error = req.query.error;
    const returnUrl = req.query.return || `/user/${username}/config`;
    
    const html = `
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🔒 ${username} - Login</title>
        <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Kanit', sans-serif;
                background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
                color: #ffffff;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
            }
            
            .login-container {
                background: rgba(255, 255, 255, 0.05);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 24px;
                padding: 40px;
                width: 100%;
                max-width: 400px;
                text-align: center;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            }
            
            .logo {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 15px;
                font-size: 28px;
                font-weight: 800;
                background: linear-gradient(135deg, #667eea, #764ba2);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                margin-bottom: 30px;
            }
            
            .username-display {
                background: rgba(102, 126, 234, 0.2);
                color: #667eea;
                padding: 10px 20px;
                border-radius: 12px;
                font-weight: 600;
                margin-bottom: 20px;
                border: 1px solid rgba(102, 126, 234, 0.3);
            }
            
            h1 {
                font-size: 2em;
                font-weight: 700;
                margin-bottom: 10px;
                background: linear-gradient(135deg, #667eea, #764ba2);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            
            .form-group {
                margin-bottom: 25px;
                text-align: left;
            }
            
            label {
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
                color: rgba(255, 255, 255, 0.9);
                font-size: 15px;
            }
            
            input[type="password"] {
                width: 100%;
                padding: 16px 20px;
                background: rgba(255, 255, 255, 0.1);
                border: 2px solid rgba(255, 255, 255, 0.2);
                border-radius: 16px;
                color: white;
                font-size: 16px;
                font-family: 'Kanit', sans-serif;
                transition: all 0.3s ease;
            }
            
            input[type="password"]:focus {
                outline: none;
                border-color: #667eea;
                background: rgba(255, 255, 255, 0.15);
                box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.2);
            }
            
            .login-btn {
                width: 100%;
                padding: 16px 32px;
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                border: none;
                border-radius: 16px;
                font-size: 16px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
                margin-bottom: 20px;
            }
            
            .login-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 12px 40px rgba(102, 126, 234, 0.4);
            }
            
            .error-message {
                background: rgba(239, 68, 68, 0.2);
                border: 1px solid rgba(239, 68, 68, 0.3);
                color: #fca5a5;
                padding: 12px 16px;
                border-radius: 12px;
                margin-bottom: 20px;
                font-size: 14px;
            }
            
            .info {
                color: rgba(255, 255, 255, 0.6);
                font-size: 14px;
                line-height: 1.5;
            }
            
            .back-link {
                color: #667eea;
                text-decoration: none;
                font-weight: 600;
                margin-top: 20px;
                display: inline-block;
            }
            
            .back-link:hover {
                text-decoration: underline;
            }
        </style>
    </head>
    <body>
        <div class="login-container">
            <div class="logo">
                <span>🔒 User Login</span>
            </div>
            
            <div class="username-display">@${username}</div>
            
            <h1>เข้าสู่ระบบ</h1>
            
            ${error ? `<div class="error-message">${decodeURIComponent(error)}</div>` : ''}
            
            <form action="/user/${username}/auth" method="post">
                <input type="hidden" name="returnUrl" value="${returnUrl}">
                
                <div class="form-group">
                    <label for="password">🔑 รหัสผ่าน</label>
                    <input type="password" id="password" name="password" placeholder="ใส่รหัสผ่านของคุณ" required autofocus>
                </div>
                
                <button type="submit" class="login-btn">🚀 เข้าสู่ระบบ</button>
            </form>
            
            <div class="info">
                <p>🔐 รหัสผ่านเฉพาะสำหรับ ${username}</p>
                <p>💡 ลืมรหัสผ่าน? ติดต่อ Admin</p>
            </div>
            
            <a href="/" class="back-link">← กลับหน้าแรก</a>
        </div>
    </body>
    </html>
    `;
    
    res.send(html);
});

// ตรวจสอบรหัสผ่าน User
app.post('/user/:username/auth', async (req, res) => {
    const username = req.username;
    const { password, returnUrl } = req.body;
    
    try {
        await userManager.verifyLogin(username, password);
        
        // 🔧 สร้าง session ใหม่เพื่อป้องกัน session fixation
        req.session.regenerate((err) => {
            if (err) {
                console.error('❌ Session regeneration error:', err);
                return res.status(500).send('ไม่สามารถสร้าง session ได้');
            }
            
            // เก็บ session ด้วยข้อมูลเพิ่มเติม
            if (!req.session.userAuth) {
                req.session.userAuth = {};
            }
            
            req.session.userAuth[username] = {
                loginAt: Date.now(),
                lastAccessAt: Date.now(),
                ip: req.ip,
                userAgent: req.get('User-Agent')?.substring(0, 100),
                sessionId: req.sessionID
            };
            
            // 🔧 บังคับ save session
            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('❌ Session save error after login:', saveErr);
                    return res.status(500).send('ไม่สามารถบันทึก session ได้');
                }
                
                console.log(`✅ User login successful: ${username} from IP: ${req.ip}`);
                console.log(`🔐 New session created with ID: ${req.sessionID?.substring(0, 8)}...`);
                
                const finalReturnUrl = returnUrl && returnUrl !== 'undefined' ? 
                    returnUrl : `/user/${username}/config`;
                
                res.redirect(finalReturnUrl);
            });
        });
        
    } catch (error) {
        console.log(`❌ User login failed: ${username} - ${error.message}`);
        const errorMsg = encodeURIComponent(`❌ ${error.message}`);
        const returnParam = returnUrl ? `&return=${encodeURIComponent(returnUrl)}` : '';
        res.redirect(`/user/${username}/login?error=${errorMsg}${returnParam}`);
    }
});

app.post('/user/:username/api/reset-password', async (req, res) => {
    try {
        const username = req.username;
        
        // ⭐ เพิ่มการตรวจสอบ user เก่า
        const userData = userManager.loadUserData(username);
        let wasOldUser = false;
        
        // ตรวจสอบว่าเป็น user เก่าที่ไม่มี auth หรือไม่
        if (!userData.auth || !userData.auth.hashedPassword) {
            console.log(`🔄 User ${username} is old user, needs migration`);
            wasOldUser = true;
        }
        
        const newPassword = await userManager.resetPassword(username);
        
        console.log(`🔑 Password ${wasOldUser ? 'created' : 'reset'} for: ${username}`);
        
        res.json({
            success: true,
            message: wasOldUser ? 'สร้างรหัสผ่านสำเร็จ (User เก่า)' : 'รีเซ็ตรหัสผ่านสำเร็จ',
            newPassword: newPassword,
            wasOldUser: wasOldUser
        });
        
    } catch (error) {
        console.error(`❌ Reset password error for ${req.username}:`, error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.get('/user/:username/api/session-status', (req, res) => {
    const username = req.username;
    
    if (!req.session || !req.session.userAuth || !req.session.userAuth[username]) {
        return res.status(401).json({
            success: false,
            authenticated: false,
            message: 'Not authenticated'
        });
    }
    
    const userSession = req.session.userAuth[username];
    const sessionAge = Date.now() - userSession.loginAt;
    const maxAge = 24 * 60 * 60 * 1000; // 24 ชั่วโมง
    
    if (sessionAge > maxAge) {
        delete req.session.userAuth[username];
        return res.status(401).json({
            success: false,
            authenticated: false,
            message: 'Session expired'
        });
    }
    
    // อัพเดท lastAccessAt
    userSession.lastAccessAt = Date.now();
    
    res.json({
        success: true,
        authenticated: true,
        loginAt: userSession.loginAt,
        lastAccessAt: userSession.lastAccessAt,
        sessionAge: sessionAge,
        maxAge: maxAge,
        timeRemaining: maxAge - sessionAge
    });
});


// Logout สำหรับ User
app.get('/user/:username/logout', (req, res) => {
    const username = req.username;
    
    if (req.session.userAuth && req.session.userAuth[username]) {
        delete req.session.userAuth[username];
    }
    
    res.redirect(`/user/${username}/login`);
});

// ===============================
// Error Handling
// ===============================
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(500).json({ 
        success: false, 
        message: 'Something went wrong!' 
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>404 - Page Not Found</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>404 - Page Not Found</h1>
            <p>หน้าที่คุณกำลังมองหาไม่พบ</p>
            <a href="/" style="color: #667eea; text-decoration: none;">← กลับหน้าแรก</a>
        </body>
        </html>
    `);
});


// ===============================
// Auto Check Expired Users System
// ===============================

// ฟังก์ชันตรวจสอบ users หมดอายุ
function checkExpiredUsersScheduler() {
    console.log('🔍 Running expired users check...');
    
    const checkResult = userManager.checkExpiredUsers();
    
    if (checkResult.success) {
        console.log(`📊 Expired Users Check Result:`);
        console.log(`   Total Checked: ${checkResult.totalChecked}`);
        console.log(`   Expired: ${checkResult.expired}`);
        console.log(`   About to Expire (≤3 days): ${checkResult.aboutToExpire}`);
        
        // แสดงรายละเอียด users ที่ใกล้หมดอายุ
        if (checkResult.aboutToExpire > 0) {
            console.log('⚠️ Users about to expire:');
            checkResult.results
                .filter(r => r.status === 'warning')
                .forEach(user => {
                    console.log(`   📅 ${user.username}: ${user.daysLeft} days left`);
                });
        }
        
        // แสดงรายละเอียด users ที่หมดอายุแล้ว
        if (checkResult.expired > 0) {
            console.log('🚫 Expired users:');
            checkResult.results
                .filter(r => r.status === 'expired')
                .forEach(user => {
                    console.log(`   ❌ ${user.username}: expired ${user.daysOverdue} days ago`);
                });
        }
        
        // ลบ users ที่หมดอายุออกจากระบบ
        if (checkResult.expired > 0) {
            console.log('🗑️ Starting cleanup of expired users...');
            const cleanupResult = userManager.cleanupExpiredUsers();
            
            if (cleanupResult.success) {
                console.log(`✅ Cleanup completed: ${cleanupResult.deletedCount} users deleted`);
                cleanupResult.deletedUsers.forEach(user => {
                    console.log(`   🗂️ ${user.username} backed up to: ${path.basename(user.backupPath)}`);
                });
            } else {
                console.error('❌ Cleanup failed:', cleanupResult.error);
            }
        }
    } else {
        console.error('❌ Expired users check failed:', checkResult.error);
    }
    
    console.log('🔍 Expired users check completed.\n');
}

// รันทันทีเมื่อ server เริ่มต้น
console.log('🚀 Running initial expired users check...');
setTimeout(checkExpiredUsersScheduler, 5000); // รอ 5 วินาทีให้ server เริ่มต้นเสร็จ

// ตั้งเวลาให้รันทุก 1 ชั่วโมง (3,600,000 ms)
const expiredUsersCheckInterval = setInterval(checkExpiredUsersScheduler, 60 * 60 * 1000);
console.log('⏰ Scheduled expired users check every 1 hour');


// ===============================
// Start Server - 🔧 Enhanced with Domain Support
// ===============================
// 🔧 เปลี่ยน Server Binding เป็น 0.0.0.0
server.listen(PORT, '0.0.0.0', () => {
    // 🔧 Enhanced Protocol Detection
    const protocol = USE_HTTPS ? 'https' : 'http';
    
    console.log('🎉 =====================================');
    console.log('🚀 Enhanced Multi-User Alert System with Domain Support Started!');
    console.log('🎉 =====================================');
    // 🔧 Enhanced Console Output with Domain Support
    console.log(`🌐 Domain: ${protocol}://${DOMAIN}:${PORT}`);
    console.log(`🏠 Homepage: ${protocol}://${DOMAIN}:${PORT}/`);
    console.log(`📊 API Status: ${protocol}://${DOMAIN}:${PORT}/api/status`);
    console.log(`🏥 Health Check: ${protocol}://${DOMAIN}:${PORT}/health`);
    console.log('🔧 =====================================');
    console.log('🔧 API Endpoints:');
    console.log(`   🆕 Create User: POST ${protocol}://${DOMAIN}:${PORT}/api/user/create`);
    console.log(`   🔍 API Auth Check: GET ${protocol}://${DOMAIN}:${PORT}/api/auth/check`);
    console.log(`   🔑 API Key: ${API_KEY.substring(0, 8)}...`);
    console.log('🔧 =====================================');
    console.log(`🔒 HTTPS Enabled: ${USE_HTTPS}`);
    console.log(`💾 Users Directory: ${userManager.USER_DATA_DIR}`);
    console.log('🎉 =====================================');
    
    // แสดงรายชื่อ users ที่มีอยู่
    const existingUsers = userManager.getAllUsers();
    if (existingUsers.length > 0) {
        console.log(`👥 Existing Users (${existingUsers.length}):`);
        existingUsers.forEach(user => {
            console.log(`   📺 ${user.username} - ${user.streamTitle}`);
            // 🔧 Enhanced URL Display with Domain Support
            console.log(`      💝 Donate: ${protocol}://${DOMAIN}:${PORT}/user/${user.username}/donate`);
            console.log(`      📺 Widget: ${protocol}://${DOMAIN}:${PORT}/user/${user.username}/widget`);
            console.log(`      🎮 Control: ${protocol}://${DOMAIN}:${PORT}/user/${user.username}/control`);
            console.log(`      ⚙️ Settings: ${protocol}://${DOMAIN}:${PORT}/user/${user.username}/config`);
            
            // แสดงวิธีการรับเงินที่เปิดใช้งาน
            const paymentMethods = [];
            if (user.enableTrueWallet) paymentMethods.push('TrueWallet');
            if (user.enableBankTransfer) paymentMethods.push('Bank Transfer');
            if (paymentMethods.length > 0) {
                console.log(`      💳 Payment Methods: ${paymentMethods.join(', ')}`);
            }
        });
        console.log('🎉 =====================================');
    }
    
    // แสดง feature status
    console.log('🔧 Features Status:');
    console.log(`   🎯 TrueWallet API: ${truewallet ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`   🏦 Bank Transfer: ✅ Enabled`);
    console.log(`   🔍 Slip Verification: ✅ Enabled`);
    console.log(`   🚀 Enhanced Bank Validation: ✅ Enabled`);
    console.log(`   🌐 Domain Support: ✅ Enabled (${DOMAIN})`); // 🔧 เพิ่ม domain status
    console.log(`   🔒 HTTPS Support: ${USE_HTTPS ? '✅ Enabled' : '❌ Disabled'}`); // 🔧 เพิ่ม HTTPS status
    console.log(`   📊 Advanced Analytics: ✅ Enabled`);
    console.log('🎉 =====================================');
    
    // แสดง debug information
    console.log('🔍 Debug Information:');
    templateEngine.debugInfo();
    
    // แสดงสถิติระบบ
    const globalStats = userManager.getGlobalStats();
    console.log('📊 System Statistics:');
    console.log(`   👥 Total Users: ${globalStats.totalUsers}`);
    console.log(`   💰 Total Donations: ${globalStats.totalDonations}`);
    console.log(`   💵 Total Amount: ฿${globalStats.totalAmount.toLocaleString()}`);
    console.log(`   🟢 Active Users (7 days): ${globalStats.activeUsers}`);
    
    // แสดงสถิติการใช้งานตามประเภท
    if (globalStats.paymentMethodUsage) {
        console.log('💳 Payment Method Usage:');
        console.log(`   🎯 TrueWallet Users: ${globalStats.paymentMethodUsage.truewallet}`);
        console.log(`   🏦 Bank Transfer Users: ${globalStats.paymentMethodUsage.bank_transfer}`);
        console.log(`   💯 Both Methods: ${globalStats.paymentMethodUsage.both}`);
    }
    
    console.log('🎉 =====================================');
});

// Graceful Shutdown - 🔧 Enhanced
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    
    // หยุด interval timer
    if (expiredUsersCheckInterval) {
        clearInterval(expiredUsersCheckInterval);
        console.log('⏰ Stopped expired users check interval');
    }
    
    // สำรองข้อมูลก่อนปิด
    console.log('📦 Creating backup before shutdown...');
    userManager.backupAllUsers();
    
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    
    // หยุด interval timer
    if (expiredUsersCheckInterval) {
        clearInterval(expiredUsersCheckInterval);
        console.log('⏰ Stopped expired users check interval');
    }
    
    // สำรองข้อมูลก่อนปิด
    console.log('📦 Creating backup before shutdown...');
    userManager.backupAllUsers();
    
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    
    // สำรองข้อมูลก่อนปิด
    console.log('📦 Creating backup before shutdown...');
    userManager.backupAllUsers();
    
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    
    // สำรองข้อมูลก่อนปิด
    console.log('📦 Creating emergency backup...');
    userManager.backupAllUsers();
    
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    
    // สำรองข้อมูลก่อนปิด
    console.log('📦 Creating emergency backup...');
    userManager.backupAllUsers();
    
    process.exit(1);
});

module.exports = { app, userManager, templateEngine };