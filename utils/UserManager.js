// utils/UserManager.js - Enhanced Version with Bank Transfer Support

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

class UserManager {
    constructor() {
        this.USER_DATA_DIR = path.join(__dirname, '..', 'users');
        this.ensureUserDirectory();
    }

    // ฟังก์ชันสำหรับ hash รหัสผ่าน
    async hashPassword(password) {
        const saltRounds = 10;
        return await bcrypt.hash(password, saltRounds);
    }

    // ฟังก์ชันสำหรับตรวจสอบรหัสผ่าน
    async verifyPassword(password, hashedPassword) {
        return await bcrypt.compare(password, hashedPassword);
    }

    // ฟังก์ชัน login verification
    async verifyLogin(username, password) {
        const userData = this.loadUserData(username);
        
        // ตรวจสอบว่าบัญชีถูกล็อคหรือไม่
        if (userData.auth.lockedUntil && Date.now() < userData.auth.lockedUntil) {
            const lockTime = Math.ceil((userData.auth.lockedUntil - Date.now()) / 1000 / 60);
            throw new Error(`บัญชีถูกล็อค กรุณารอ ${lockTime} นาที`);
        }
        
        // ตรวจสอบรหัสผ่าน
        const isValidPassword = await this.verifyPassword(password, userData.auth.hashedPassword);
        
        if (!isValidPassword) {
            // เพิ่มจำนวนครั้งที่ login ผิด
            userData.auth.loginAttempts = (userData.auth.loginAttempts || 0) + 1;
            
            // ล็อคบัญชีถ้า login ผิด 5 ครั้ง
            if (userData.auth.loginAttempts >= 5) {
                userData.auth.lockedUntil = Date.now() + (15 * 60 * 1000); // ล็อค 15 นาที
                this.saveUserData(username, userData);
                throw new Error('Login ผิด 5 ครั้ง บัญชีถูกล็อค 15 นาที');
            }
            
            this.saveUserData(username, userData);
            throw new Error(`รหัสผ่านไม่ถูกต้อง (เหลือ ${5 - userData.auth.loginAttempts} ครั้ง)`);
        }
        
        // Login สำเร็จ - reset attempts และ update login time
        userData.auth.loginAttempts = 0;
        userData.auth.lockedUntil = null;
        userData.auth.lastLoginAt = Date.now();
        this.saveUserData(username, userData);
        
        console.log(`🔑 User logged in: ${username}`);
        return true;
    }

    // ฟังก์ชันสำหรับ reset รหัสผ่าน (สำหรับ admin หรือ user เก่า)
    async resetPassword(username) {
        const userData = this.loadUserData(username);
        
        // ⭐ เพิ่มการตรวจสอบและสร้าง auth object ถ้าไม่มี
        if (!userData.auth) {
            console.log(`⚠️ Creating auth object for user: ${username}`);
            userData.auth = {
                hashedPassword: '',
                lastLoginAt: null,
                loginAttempts: 0,
                lockedUntil: null
            };
        }
        
        // สร้างรหัสผ่านใหม่
        const newPassword = this.generateDefaultPassword();
        userData.auth.hashedPassword = await this.hashPassword(newPassword);
        userData.auth.loginAttempts = 0;
        userData.auth.lockedUntil = null;
        userData.auth.lastLoginAt = null; // รีเซ็ต login time
        
        this.saveUserData(username, userData);
        
        console.log(`🔑 Password reset for user: ${username} - New password: ${newPassword}`);
        return newPassword;
    }

    // ฟังก์ชันสร้างรหัสผ่านแบบสุ่ม
    generateDefaultPassword() {
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let password = '';
        for (let i = 0; i < 8; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    // สร้าง folder users ถ้ายังไม่มี
    ensureUserDirectory() {
        if (!fs.existsSync(this.USER_DATA_DIR)) {
            fs.mkdirSync(this.USER_DATA_DIR, { recursive: true });
            console.log('📁 Created users directory');
        }
    }

    // ได้ path ของไฟล์ user
    getUserDataPath(username) {
        return path.join(this.USER_DATA_DIR, `${username}.json`);
    }

    // ตรวจสอบว่า username ถูกต้องหรือไม่
    validateUsername(username) {
        const errors = [];
        
        if (!username) {
            errors.push('Username is required');
        } else if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
            errors.push('Username must be 3-20 characters (letters, numbers, _, -)');
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // ตรวจสอบว่า user มีอยู่หรือไม่
    userExists(username) {
        return fs.existsSync(this.getUserDataPath(username));
    }

    // โหลดข้อมูล user (ถ้าไม่มีจะสร้างใหม่)
    loadUserData(username) {
        try {
            const userPath = this.getUserDataPath(username);
            
            if (fs.existsSync(userPath)) {
                const data = JSON.parse(fs.readFileSync(userPath, 'utf8'));
                
                // Migrate old data structure if needed
                const migratedData = this.migrateUserData(data);
                
                console.log(`📖 Loaded data for user: ${username}`);
                return migratedData;
            }
        } catch (error) {
            console.error(`❌ Error loading user data for ${username}:`, error);
        }
        
        // สร้างข้อมูล default ถ้าไม่มี
        const defaultData = this.createDefaultUserData(username);
        this.saveUserData(username, defaultData);
        return defaultData;
    }

    // Migrate old data structure to new format
    migrateUserData(userData) {
        // ตรวจสอบและเพิ่มฟิลด์ใหม่ที่อาจขาดหายไป
        const defaultData = this.createDefaultUserData(userData.username);
        
        // Merge กับ default config
        userData.config = { ...defaultData.config, ...userData.config };
        userData.stats = { ...defaultData.stats, ...userData.stats };
        userData.advanced = { ...defaultData.advanced, ...userData.advanced };
        
        // ตรวจสอบและเพิ่ม bank settings ถ้าไม่มี
        if (!userData.config.enableBankTransfer) {
            userData.config.enableBankTransfer = false;
        }
        if (!userData.config.bankName) {
            userData.config.bankName = '';
        }
        if (!userData.config.bankAccount) {
            userData.config.bankAccount = '';
        }
        if (!userData.config.bankAccountName) {
            userData.config.bankAccountName = '';
        }
        
        // ตรวจสอบและเพิ่ม payment method stats ถ้าไม่มี
        if (!userData.stats.paymentMethods) {
            userData.stats.paymentMethods = {
                truewallet: { count: 0, amount: 0 },
                bank_transfer: { count: 0, amount: 0 },
                manual: { count: 0, amount: 0 }
            };
            
            // คำนวณสถิติจากข้อมูลเก่า
            if (userData.donations && userData.donations.length > 0) {
                this.updateStats(userData);
            }
        }
        
        return userData;
    }

    // สร้างข้อมูล user เริ่มต้น
    createDefaultUserData(username) {
        return {
            username: username,
            createdAt: Date.now(),
            lastActiveAt: Date.now(),

            auth: {
                hashedPassword: '', // จะใส่ค่าจริงตอน createUser
                lastLoginAt: null,
                loginAttempts: 0,
                lockedUntil: null
            },

            // ระบบให้เช่า
            rental: {
                isRental: false,
                rentalDays: 0,
                expiresAt: null,
                expiresAtFormatted: null,
                isExpired: false,
                createdAt: Date.now()
            },
            
            // การตั้งค่า
            config: {
                // TrueWallet settings
                truewalletPhone: '',
                
                // Bank settings
                enableBankTransfer: false,
                bankName: '',
                bankAccount: '',
                bankAccountName: '',
                
                // Stream settings
                streamTitle: `${username}'s Stream`,
                alertDuration: 5000,
                enableTTS: true,
                enableTTSName: true,
                enableTTSMessage: true,
                enableSound: true,
                alertPosition: 'top',
                customCSS: '',
                welcomeMessage: `ยินดีต้อนรับสู่สตรีมของ ${username}!`,
                
                // Widget customization
                alertFormat: '{{user}} โดเนท {{amount}}',
                minTTSAmount: 50, // จำนวนขั้นต่ำที่จะอ่าน TTS
                showBackground: false,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                textColor: '#1f2937',
                amountColor: '#f59e0b',
                donorColor: '#667eea',
                messageColor: '#6b7280',
                fontSize: 42,
                amountSize: 56,
                messageSize: 24,
                borderRadius: 25,
                showIcon: true,
                showSparkles: true,
                animationSpeed: 1.2, // ความเร็วของ animation
                customGifUrl: '', // URL ของ GIF ที่จะแสดงแทนไอคอน
                useCustomGif: false // เปิด/ปิดการใช้ GIF แทนไอคอน
            },
            
            // ประวัติการสนับสนุน
            donations: [],
            
            // สถิติ
            stats: {
                totalDonations: 0,
                totalAmount: 0,
                averageAmount: 0,
                highestDonation: 0,
                uniqueDonors: 0,
                thisMonthAmount: 0,
                lastDonationAt: null,
                
                // สถิติแยกตามประเภทการชำระเงิน
                paymentMethods: {
                    truewallet: { count: 0, amount: 0 },
                    bank_transfer: { count: 0, amount: 0 },
                    manual: { count: 0, amount: 0 }
                }
            },
            
            // การตั้งค่าขั้นสูง
            advanced: {
                webhookUrl: '',
                discordWebhook: '',
                customAlerts: {
                    milestone100: true,
                    milestone500: true,
                    milestone1000: true
                },
                // API settings
                slipApiSettings: {
                    enabled: true,
                    maxRetries: 3,
                    timeoutMs: 30000
                }
            }
        };
    }

    // บันทึกข้อมูล user
    saveUserData(username, userData) {
        try {
            const userPath = this.getUserDataPath(username);
            userData.lastActiveAt = Date.now();
            
            fs.writeFileSync(userPath, JSON.stringify(userData, null, 2), 'utf8');
            console.log(`💾 Saved data for user: ${username}`);
            return true;
        } catch (error) {
            console.error(`❌ Error saving user data for ${username}:`, error);
            return false;
        }
    }

    // สร้าง user ใหม่
    async createUser(username, initialConfig = {}) {
        const validation = this.validateUsername(username);
        
        if (!validation.isValid) {
            throw new Error(`Invalid username: ${validation.errors.join(', ')}`);
        }

        if (this.userExists(username)) {
            throw new Error(`User '${username}' already exists`);
        }

        const userData = this.createDefaultUserData(username);

        // สร้างรหัสผ่านเริ่มต้น
        const defaultPassword = this.generateDefaultPassword();
        userData.auth.hashedPassword = await this.hashPassword(defaultPassword);
        
        // ตั้งค่าระบบให้เช่า
        if (initialConfig.rentalDays) {
            const rentalDays = parseInt(initialConfig.rentalDays);
            const expiresAt = Date.now() + (rentalDays * 24 * 60 * 60 * 1000);
            
            userData.rental = {
                isRental: true,
                rentalDays: rentalDays,
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
                createdAt: Date.now()
            };
        }
        
        // ใส่ config เริ่มต้น
        if (initialConfig.truewalletPhone) {
            userData.config.truewalletPhone = initialConfig.truewalletPhone;
        }
        if (initialConfig.streamTitle) {
            userData.config.streamTitle = initialConfig.streamTitle;
        }
        if (initialConfig.bankName) {
            userData.config.bankName = initialConfig.bankName;
        }
        if (initialConfig.bankAccount) {
            userData.config.bankAccount = initialConfig.bankAccount;
        }
        if (initialConfig.bankAccountName) {
            userData.config.bankAccountName = initialConfig.bankAccountName;
        }

        this.saveUserData(username, userData);
        
        console.log(`✅ Created new user: ${username} with password: ${defaultPassword}`);

        // Return ข้อมูลรวมรหัสผ่าน (เฉพาะตอนสร้างเท่านั้น)
        return {
            userData: userData,
            defaultPassword: defaultPassword
        };
    }

    isDuplicateDiscriminator(username, discriminator) {
        if (!discriminator) return false;
        
        const userData = this.loadUserData(username);
        return userData.donations.some(d => d.discriminator === discriminator);
    }
    // เพิ่มการสนับสนุนใหม่
    addDonation(username, donationData) {
        const userData = this.loadUserData(username);
        
        const donation = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            timestamp: Date.now(),
            bangkokTime: new Date().toLocaleString('th-TH', { 
                timeZone: 'Asia/Bangkok',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }),
            name: donationData.name,
            amount: parseInt(donationData.amount),
            message: donationData.message || '',
            paymentMethod: donationData.paymentMethod || 'manual',
            
            // TrueWallet specific
            voucherCode: donationData.voucherCode || '',
            phoneNumber: donationData.phoneNumber || '',
            
            // Bank transfer specific
            bankName: donationData.bankName || '',
            bankAccount: donationData.bankAccount || '',
            transactionRef: donationData.transactionRef || '',
            discriminator: donationData.discriminator || '', // เพิ่มการเก็บ discriminator
            slipData: donationData.slipData || null,
            
            // Common fields
            ip: donationData.ip || 'unknown',
            userAgent: donationData.userAgent || 'unknown',
            status: 'completed'
        };
    
        // เพิ่มเข้าด้านหน้าของ array
        userData.donations.unshift(donation);
    
        // เก็บไว้แค่ 1000 รายการล่าสุด
        if (userData.donations.length > 1000) {
            userData.donations = userData.donations.slice(0, 1000);
        }
    
        // อัพเดทสถิติ
        this.updateStats(userData);
    
        // บันทึกข้อมูล
        this.saveUserData(username, userData);
    
        console.log(`💰 New donation for ${username}: ${donation.name} - ฿${donation.amount} (${donation.paymentMethod})`);
        return donation;
    }

    // อัพเดทสถิติ
    updateStats(userData) {
        const donations = userData.donations;
        
        // สถิติรวม
        userData.stats.totalDonations = donations.length;
        userData.stats.totalAmount = donations.reduce((sum, d) => sum + d.amount, 0);
        userData.stats.averageAmount = donations.length > 0 ? 
            Math.round(userData.stats.totalAmount / donations.length) : 0;
        userData.stats.highestDonation = donations.length > 0 ? 
            Math.max(...donations.map(d => d.amount)) : 0;
        
        // นับ unique donors
        const uniqueDonors = new Set(donations.map(d => d.name.toLowerCase()));
        userData.stats.uniqueDonors = uniqueDonors.size;
        
        // 🔧 แก้ไขการคำนวณเดือนนี้และวันนี้ให้ใช้ Bangkok timezone
        const now = new Date();
        const bangkokTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Bangkok"}));
        
        // จำนวนเงินเดือนนี้
        const startOfMonth = new Date(bangkokTime.getFullYear(), bangkokTime.getMonth(), 1);
        userData.stats.thisMonthAmount = donations
            .filter(d => new Date(d.timestamp) >= startOfMonth)
            .reduce((sum, d) => sum + d.amount, 0);
        
        // 🔧 เพิ่มการคำนวณวันนี้
        const todayStart = new Date(bangkokTime.getFullYear(), bangkokTime.getMonth(), bangkokTime.getDate());
        const todayEnd = new Date(todayStart.getTime() + (24 * 60 * 60 * 1000) - 1);
        
        const todayDonations = donations.filter(d => {
            const donationTime = new Date(d.timestamp);
            return donationTime >= todayStart && donationTime <= todayEnd;
        });
        
        userData.stats.todayDonations = todayDonations.length;
        userData.stats.todayAmount = todayDonations.reduce((sum, d) => sum + d.amount, 0);
        
        // การสนับสนุนล่าสุด
        userData.stats.lastDonationAt = donations.length > 0 ? donations[0].timestamp : null;
        
        // สถิติแยกตามประเภทการชำระเงิน
        userData.stats.paymentMethods = {
            truewallet: {
                count: donations.filter(d => d.paymentMethod === 'truewallet').length,
                amount: donations.filter(d => d.paymentMethod === 'truewallet').reduce((sum, d) => sum + d.amount, 0)
            },
            bank_transfer: {
                count: donations.filter(d => d.paymentMethod === 'bank_transfer').length,
                amount: donations.filter(d => d.paymentMethod === 'bank_transfer').reduce((sum, d) => sum + d.amount, 0)
            },
            manual: {
                count: donations.filter(d => d.paymentMethod === 'manual').length,
                amount: donations.filter(d => d.paymentMethod === 'manual').reduce((sum, d) => sum + d.amount, 0)
            }
        };
        
        console.log(`📊 Updated stats for ${userData.username}: Today ${userData.stats.todayDonations} donations, ฿${userData.stats.todayAmount}`);
    }

    // อัพเดทการตั้งค่า
    updateConfig(username, newConfig) {
        const userData = this.loadUserData(username);
        
        // Validate bank settings
        if (newConfig.bankAccount !== undefined) {
            // ตรวจสอบรูปแบบเลขบัญชี
            const cleanAccount = String(newConfig.bankAccount).replace(/[^0-9-]/g, '');
            if (cleanAccount && !/^[\d-]{1,20}$/.test(cleanAccount)) {
                throw new Error('รูปแบบเลขบัญชีไม่ถูกต้อง');
            }
            newConfig.bankAccount = cleanAccount;
        }
        
        if (newConfig.bankAccountName !== undefined) {
            // ตรวจสอบชื่อบัญชี
            const cleanName = String(newConfig.bankAccountName).trim();
            if (cleanName && !/^[a-zA-Zก-๙\s]{1,50}$/.test(cleanName)) {
                throw new Error('ชื่อบัญชีต้องเป็นตัวอักษรไทยหรือภาษาอังกฤษเท่านั้น');
            }
            newConfig.bankAccountName = cleanName;
        }
        
        // Validate other existing config values
        if (newConfig.minTTSAmount !== undefined) {
            newConfig.minTTSAmount = Math.max(0, parseInt(newConfig.minTTSAmount) || 0);
        }
        if (newConfig.fontSize !== undefined) {
            newConfig.fontSize = Math.max(12, Math.min(100, parseInt(newConfig.fontSize) || 42));
        }
        if (newConfig.amountSize !== undefined) {
            newConfig.amountSize = Math.max(12, Math.min(120, parseInt(newConfig.amountSize) || 56));
        }
        if (newConfig.borderRadius !== undefined) {
            newConfig.borderRadius = Math.max(0, Math.min(50, parseInt(newConfig.borderRadius) || 25));
        }
        if (newConfig.messageSize !== undefined) {
            newConfig.messageSize = Math.max(12, Math.min(48, parseInt(newConfig.messageSize) || 24));
        }
        if (newConfig.animationSpeed !== undefined) {
            newConfig.animationSpeed = Math.max(0.1, Math.min(5, parseFloat(newConfig.animationSpeed) || 1.2));
        }
        
        userData.config = { ...userData.config, ...newConfig };
        this.saveUserData(username, userData);
        
        console.log(`⚙️ Updated config for ${username}`);
        return userData.config;
    }

    // ตรวจสอบการตั้งค่าธนาคาร
    validateBankSettings(username) {
        const userData = this.loadUserData(username);
        const config = userData.config;
        
        const validation = {
            isValid: true,
            errors: [],
            warnings: []
        };
        
        if (config.enableBankTransfer) {
            if (!config.bankName) {
                validation.errors.push('กรุณาเลือกธนาคาร');
                validation.isValid = false;
            }
            
            if (!config.bankAccount) {
                validation.errors.push('กรุณากรอกเลขบัญชี');
                validation.isValid = false;
            } else if (!/^[\d-]{1,20}$/.test(config.bankAccount)) {
                validation.errors.push('รูปแบบเลขบัญชีไม่ถูกต้อง');
                validation.isValid = false;
            }
            
            if (!config.bankAccountName) {
                validation.errors.push('กรุณากรอกชื่อบัญชี');
                validation.isValid = false;
            } else if (!/^[a-zA-Zก-๙\s]{1,50}$/.test(config.bankAccountName)) {
                validation.errors.push('ชื่อบัญชีต้องเป็นตัวอักษรไทยหรือภาษาอังกฤษเท่านั้น');
                validation.isValid = false;
            }
            
            // Warnings
            if (config.bankAccount && config.bankAccount.length < 10) {
                validation.warnings.push('เลขบัญชีอาจสั้นเกินไป กรุณาตรวจสอบให้แน่ใจ');
            }
        }
        
        return validation;
    }

    // ตรวจสอบ transaction ซ้ำ
    isDuplicateTransaction(username, transactionRef) {
        if (!transactionRef) return false;
        
        const userData = this.loadUserData(username);
        return userData.donations.some(d => d.transactionRef === transactionRef);
    }

    // ดูสถิติการโดเนทแยกตามประเภท
    getDonationStatsByMethod(username) {
        const userData = this.loadUserData(username);
        const donations = userData.donations;
        
        const stats = {
            total: {
                count: donations.length,
                amount: donations.reduce((sum, d) => sum + d.amount, 0)
            },
            by_method: {},
            recent_trends: {},
            daily_trends: {}
        };
        
        // แยกสถิติตามประเภท
        const methods = ['truewallet', 'bank_transfer', 'manual'];
        methods.forEach(method => {
            const methodDonations = donations.filter(d => d.paymentMethod === method);
            stats.by_method[method] = {
                count: methodDonations.length,
                amount: methodDonations.reduce((sum, d) => sum + d.amount, 0),
                percentage: donations.length > 0 ? 
                    Math.round((methodDonations.length / donations.length) * 100) : 0,
                averageAmount: methodDonations.length > 0 ?
                    Math.round(methodDonations.reduce((sum, d) => sum + d.amount, 0) / methodDonations.length) : 0
            };
        });
        
        // แนวโน้ม 30 วันล่าสุด
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const recentDonations = donations.filter(d => d.timestamp > thirtyDaysAgo);
        
        methods.forEach(method => {
            const recentMethodDonations = recentDonations.filter(d => d.paymentMethod === method);
            stats.recent_trends[method] = {
                count: recentMethodDonations.length,
                amount: recentMethodDonations.reduce((sum, d) => sum + d.amount, 0)
            };
        });
        
        // แนวโน้มรายวัน 7 วันล่าสุด
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        for (let i = 0; i < 7; i++) {
            const dayStart = sevenDaysAgo + (i * 24 * 60 * 60 * 1000);
            const dayEnd = dayStart + (24 * 60 * 60 * 1000);
            const dayDonations = donations.filter(d => d.timestamp >= dayStart && d.timestamp < dayEnd);
            
            const dayKey = new Date(dayStart).toISOString().split('T')[0];
            stats.daily_trends[dayKey] = {
                total: dayDonations.length,
                amount: dayDonations.reduce((sum, d) => sum + d.amount, 0),
                by_method: {}
            };
            
            methods.forEach(method => {
                const dayMethodDonations = dayDonations.filter(d => d.paymentMethod === method);
                stats.daily_trends[dayKey].by_method[method] = {
                    count: dayMethodDonations.length,
                    amount: dayMethodDonations.reduce((sum, d) => sum + d.amount, 0)
                };
            });
        }
        
        return stats;
    }

    // ค้นหาการโดเนทตามเงื่อนไข
    searchDonations(username, criteria = {}) {
        const userData = this.loadUserData(username);
        let donations = [...userData.donations];
        
        // ค้นหาตามชื่อหรือข้อความ
        if (criteria.search) {
            const searchLower = criteria.search.toLowerCase();
            donations = donations.filter(donation => 
                donation.name.toLowerCase().includes(searchLower) ||
                (donation.message && donation.message.toLowerCase().includes(searchLower))
            );
        }
        
        // กรองตามช่วงวันที่
        if (criteria.dateFrom || criteria.dateTo) {
            donations = donations.filter(donation => {
                const donationDate = new Date(donation.timestamp);
                if (criteria.dateFrom && donationDate < new Date(criteria.dateFrom)) return false;
                if (criteria.dateTo && donationDate > new Date(criteria.dateTo + ' 23:59:59')) return false;
                return true;
            });
        }
        
        // กรองตามประเภทการชำระเงิน
        if (criteria.paymentMethod) {
            donations = donations.filter(donation => donation.paymentMethod === criteria.paymentMethod);
        }
        
        // กรองตามจำนวนเงิน
        if (criteria.minAmount !== undefined) {
            donations = donations.filter(donation => donation.amount >= criteria.minAmount);
        }
        if (criteria.maxAmount !== undefined) {
            donations = donations.filter(donation => donation.amount <= criteria.maxAmount);
        }
        
        // เรียงลำดับ
        if (criteria.sortBy) {
            donations.sort((a, b) => {
                switch (criteria.sortBy) {
                    case 'amount_desc':
                        return b.amount - a.amount;
                    case 'amount_asc':
                        return a.amount - b.amount;
                    case 'date_asc':
                        return a.timestamp - b.timestamp;
                    case 'date_desc':
                    default:
                        return b.timestamp - a.timestamp;
                }
            });
        }
        
        return donations;
    }

    // ดูรายชื่อ users ทั้งหมด
    getAllUsers() {
        try {
            const files = fs.readdirSync(this.USER_DATA_DIR);
            const users = files
                .filter(file => file.endsWith('.json'))
                .map(file => {
                    const username = file.replace('.json', '');
                    const userData = this.loadUserData(username);
                    return {
                        username: username,
                        streamTitle: userData.config.streamTitle,
                        totalDonations: userData.stats.totalDonations,
                        totalAmount: userData.stats.totalAmount,
                        lastActiveAt: userData.lastActiveAt,
                        createdAt: userData.createdAt,
                        enableBankTransfer: userData.config.enableBankTransfer,
                        enableTrueWallet: !!userData.config.truewalletPhone,
                        paymentMethods: userData.stats.paymentMethods
                    };
                })
                .sort((a, b) => b.lastActiveAt - a.lastActiveAt); // เรียงตาม active ล่าสุด

            return users;
        } catch (error) {
            console.error('Error getting user list:', error);
            return [];
        }
    }

    // ลบ user (ใช้ระวัง!)
    deleteUser(username) {
        try {
            const userPath = this.getUserDataPath(username);
            
            if (fs.existsSync(userPath)) {
                // สำรองข้อมูลก่อนลบ
                const backupPath = path.join(this.USER_DATA_DIR, `${username}_backup_${Date.now()}.json`);
                fs.copyFileSync(userPath, backupPath);
                
                fs.unlinkSync(userPath);
                console.log(`🗑️ Deleted user: ${username} (backup saved as ${path.basename(backupPath)})`);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error(`Error deleting user ${username}:`, error);
            return false;
        }
    }

    // ได้ข้อมูลสถิติรวม
    getGlobalStats() {
        const users = this.getAllUsers();
        
        const globalStats = {
            totalUsers: users.length,
            totalDonations: users.reduce((sum, u) => sum + u.totalDonations, 0),
            totalAmount: users.reduce((sum, u) => sum + u.totalAmount, 0),
            activeUsers: users.filter(u => Date.now() - u.lastActiveAt < 7 * 24 * 60 * 60 * 1000).length, // active ใน 7 วัน
            
            // สถิติการใช้งานตามประเภท
            paymentMethodUsage: {
                truewallet: users.filter(u => u.enableTrueWallet).length,
                bank_transfer: users.filter(u => u.enableBankTransfer).length,
                both: users.filter(u => u.enableTrueWallet && u.enableBankTransfer).length
            },
            
            // สถิติการโดเนทรวม
            totalPaymentMethods: {
                truewallet: {
                    count: users.reduce((sum, u) => sum + (u.paymentMethods?.truewallet?.count || 0), 0),
                    amount: users.reduce((sum, u) => sum + (u.paymentMethods?.truewallet?.amount || 0), 0)
                },
                bank_transfer: {
                    count: users.reduce((sum, u) => sum + (u.paymentMethods?.bank_transfer?.count || 0), 0),
                    amount: users.reduce((sum, u) => sum + (u.paymentMethods?.bank_transfer?.amount || 0), 0)
                },
                manual: {
                    count: users.reduce((sum, u) => sum + (u.paymentMethods?.manual?.count || 0), 0),
                    amount: users.reduce((sum, u) => sum + (u.paymentMethods?.manual?.amount || 0), 0)
                }
            },
            
            topUsers: users
                .sort((a, b) => b.totalAmount - a.totalAmount)
                .slice(0, 5)
                .map(u => ({
                    username: u.username,
                    streamTitle: u.streamTitle,
                    totalAmount: u.totalAmount,
                    totalDonations: u.totalDonations
                }))
        };

        // คำนวณเปอร์เซ็นต์
        if (globalStats.totalDonations > 0) {
            Object.keys(globalStats.totalPaymentMethods).forEach(method => {
                globalStats.totalPaymentMethods[method].percentage = Math.round(
                    (globalStats.totalPaymentMethods[method].count / globalStats.totalDonations) * 100
                );
            });
        }
        
        return globalStats;
    }

    // สำรองข้อมูล
    backupAllUsers() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = path.join(this.USER_DATA_DIR, `backup_${timestamp}`);
            
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            
            const files = fs.readdirSync(this.USER_DATA_DIR);
            const userFiles = files.filter(file => file.endsWith('.json') && !file.includes('backup'));
            
            userFiles.forEach(file => {
                const sourcePath = path.join(this.USER_DATA_DIR, file);
                const destPath = path.join(backupDir, file);
                fs.copyFileSync(sourcePath, destPath);
            });
            
            console.log(`📦 Backup completed: ${userFiles.length} files backed up to ${backupDir}`);
            return backupDir;
        } catch (error) {
            console.error('Error creating backup:', error);
            return null;
        }
    }

    // คืนค่าข้อมูลจากสำรอง
    restoreFromBackup(backupDir) {
        try {
            if (!fs.existsSync(backupDir)) {
                throw new Error('Backup directory not found');
            }
            
            const files = fs.readdirSync(backupDir);
            const userFiles = files.filter(file => file.endsWith('.json'));
            
            let restoredCount = 0;
            userFiles.forEach(file => {
                const sourcePath = path.join(backupDir, file);
                const destPath = path.join(this.USER_DATA_DIR, file);
                fs.copyFileSync(sourcePath, destPath);
                restoredCount++;
            });
            
            console.log(`🔄 Restore completed: ${restoredCount} files restored from ${backupDir}`);
            return restoredCount;
        } catch (error) {
            console.error('Error restoring from backup:', error);
            return 0;
        }
    }

    // ล้างข้อมูลเก่า
    cleanupOldData(daysOld = 365) {
        try {
            const cutoffDate = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
            let cleanedUsers = 0;
            let cleanedDonations = 0;
            
            const users = this.getAllUsers();
            
            users.forEach(userInfo => {
                const userData = this.loadUserData(userInfo.username);
                const originalDonationCount = userData.donations.length;
                
                // ลบ donations ที่เก่าเกินกำหนด
                userData.donations = userData.donations.filter(d => d.timestamp > cutoffDate);
                const removedDonations = originalDonationCount - userData.donations.length;
                
                if (removedDonations > 0) {
                    // อัพเดทสถิติหลังจากลบข้อมูล
                    this.updateStats(userData);
                    this.saveUserData(userInfo.username, userData);
                    
                    cleanedDonations += removedDonations;
                    cleanedUsers++;
                    
                    console.log(`🧹 Cleaned ${removedDonations} old donations for user: ${userInfo.username}`);
                }
            });
            
            console.log(`🧹 Cleanup completed: ${cleanedDonations} donations removed from ${cleanedUsers} users`);
            return { cleanedUsers, cleanedDonations };
        } catch (error) {
            console.error('Error during cleanup:', error);
            return { cleanedUsers: 0, cleanedDonations: 0 };
        }
    }

    // ตรวจสอบสถานะระบบ
    getSystemHealth() {
        try {
            const users = this.getAllUsers();
            const totalFiles = fs.readdirSync(this.USER_DATA_DIR).length;
            
            // ตรวจสอบ disk usage
            const stats = fs.statSync(this.USER_DATA_DIR);
            const totalSize = users.reduce((size, user) => {
                try {
                    const userPath = this.getUserDataPath(user.username);
                    const userStats = fs.statSync(userPath);
                    return size + userStats.size;
                } catch (error) {
                    return size;
                }
            }, 0);
            
            // ตรวจหา users ที่มีปัญหา
            const problematicUsers = users.filter(user => {
                try {
                    const userData = this.loadUserData(user.username);
                    return !userData.config || !userData.stats || !userData.donations;
                } catch (error) {
                    return true;
                }
            });
            
            // ตรวจหา users ที่ไม่ active
            const inactiveUsers = users.filter(user => 
                Date.now() - user.lastActiveAt > 90 * 24 * 60 * 60 * 1000 // 90 วัน
            );
            
            return {
                status: 'healthy',
                users: {
                    total: users.length,
                    active: users.filter(u => Date.now() - u.lastActiveAt < 7 * 24 * 60 * 60 * 1000).length,
                    inactive: inactiveUsers.length,
                    problematic: problematicUsers.length
                },
                storage: {
                    totalFiles: totalFiles,
                    totalSizeBytes: totalSize,
                    totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
                    directory: this.USER_DATA_DIR
                },
                issues: {
                    problematicUsers: problematicUsers.map(u => u.username),
                    inactiveUsers: inactiveUsers.slice(0, 10).map(u => ({
                        username: u.username,
                        lastActive: new Date(u.lastActiveAt).toISOString()
                    }))
                }
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    // Export ข้อมูลเป็น CSV
    exportToCSV(username, options = {}) {
        try {
            const userData = this.loadUserData(username);
            const donations = this.searchDonations(username, options);
            
            // CSV Header
            const headers = [
                'ID',
                'Timestamp',
                'Bangkok Time',
                'Name',
                'Amount',
                'Message',
                'Payment Method',
                'Bank Name',
                'Transaction Ref',
                'IP Address',
                'Status'
            ];
            
            // CSV Rows
            const rows = donations.map(donation => [
                donation.id,
                donation.timestamp,
                donation.bangkokTime,
                `"${donation.name}"`,
                donation.amount,
                `"${donation.message || ''}"`,
                donation.paymentMethod,
                donation.bankName || '',
                donation.transactionRef || '',
                donation.ip,
                donation.status
            ]);
            
            // Combine header and rows
            const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
            
            return {
                success: true,
                filename: `${username}_donations_${new Date().toISOString().split('T')[0]}.csv`,
                content: csvContent,
                count: donations.length
            };
        } catch (error) {
            console.error(`Error exporting CSV for ${username}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Import ข้อมูลจาก CSV
    importFromCSV(username, csvContent) {
        try {
            const lines = csvContent.split('\n');
            const headers = lines[0].split(',');
            
            if (!headers.includes('Name') || !headers.includes('Amount')) {
                throw new Error('CSV format invalid: missing required columns');
            }
            
            const userData = this.loadUserData(username);
            let importedCount = 0;
            let errorCount = 0;
            
            for (let i = 1; i < lines.length; i++) {
                try {
                    const values = lines[i].split(',');
                    if (values.length < headers.length) continue;
                    
                    const donation = {};
                    headers.forEach((header, index) => {
                        donation[header.trim()] = values[index] ? values[index].replace(/"/g, '') : '';
                    });
                    
                    // Validate required fields
                    if (!donation.Name || !donation.Amount) continue;
                    
                    const donationData = {
                        name: donation.Name,
                        amount: parseInt(donation.Amount),
                        message: donation.Message || '',
                        paymentMethod: donation['Payment Method'] || 'manual',
                        ip: donation['IP Address'] || 'imported',
                        userAgent: 'CSV Import'
                    };
                    
                    this.addDonation(username, donationData);
                    importedCount++;
                } catch (error) {
                    errorCount++;
                    console.warn(`Error importing row ${i}:`, error.message);
                }
            }
            
            return {
                success: true,
                imported: importedCount,
                errors: errorCount,
                message: `Successfully imported ${importedCount} donations`
            };
        } catch (error) {
            console.error(`Error importing CSV for ${username}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ฟังก์ชันสำหรับ migrate ข้อมูลจากระบบเก่า
    migrateFromLegacyFormat(username, legacyData) {
        try {
            console.log(`🔄 Migrating legacy data for ${username}`);
            
            const userData = this.createDefaultUserData(username);
            
            // Migrate basic info
            if (legacyData.phone) {
                userData.config.truewalletPhone = legacyData.phone;
            }
            if (legacyData.title) {
                userData.config.streamTitle = legacyData.title;
            }
            
            // Migrate donations
            if (legacyData.donations && Array.isArray(legacyData.donations)) {
                userData.donations = legacyData.donations.map(donation => ({
                    id: donation.id || Date.now() + Math.floor(Math.random() * 1000),
                    timestamp: donation.timestamp || Date.now(),
                    bangkokTime: donation.bangkokTime || new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
                    name: donation.name || 'Unknown',
                    amount: parseInt(donation.amount) || 0,
                    message: donation.message || '',
                    paymentMethod: donation.method || 'manual',
                    voucherCode: donation.voucher || '',
                    phoneNumber: donation.phone || '',
                    ip: donation.ip || 'migrated',
                    userAgent: donation.userAgent || 'Legacy Migration',
                    status: 'completed'
                }));
            }
            
            // Update stats
            this.updateStats(userData);
            
            // Save migrated data
            this.saveUserData(username, userData);
            
            console.log(`✅ Migration completed for ${username}: ${userData.donations.length} donations migrated`);
            return {
                success: true,
                donationsMigrated: userData.donations.length,
                userData: userData
            };
        } catch (error) {
            console.error(`❌ Migration failed for ${username}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    // ตรวจสอบและอัพเดทสถานะ user ที่หมดอายุ
    checkExpiredUsers() {
        try {
            const users = this.getAllUsers();
            const now = Date.now();
            let expiredCount = 0;
            let aboutToExpireCount = 0;
            const results = [];

            users.forEach(userInfo => {
                const userData = this.loadUserData(userInfo.username);
                
                // ตรวจสอบเฉพาะ rental users
                if (userData.rental && userData.rental.isRental) {
                    const isExpired = now > userData.rental.expiresAt;
                    const daysLeft = Math.ceil((userData.rental.expiresAt - now) / (24 * 60 * 60 * 1000));
                    
                    // อัพเดทสถานะ
                    if (isExpired && !userData.rental.isExpired) {
                        userData.rental.isExpired = true;
                        this.saveUserData(userInfo.username, userData);
                        expiredCount++;
                        
                        results.push({
                            username: userInfo.username,
                            status: 'expired',
                            expiredAt: userData.rental.expiresAt,
                            daysOverdue: Math.abs(daysLeft)
                        });
                    } else if (!isExpired && daysLeft <= 3) {
                        aboutToExpireCount++;
                        
                        results.push({
                            username: userInfo.username,
                            status: 'warning',
                            expiresAt: userData.rental.expiresAt,
                            daysLeft: daysLeft
                        });
                    } else if (!isExpired) {
                        results.push({
                            username: userInfo.username,
                            status: 'active',
                            expiresAt: userData.rental.expiresAt,
                            daysLeft: daysLeft
                        });
                    }
                }
            });

            console.log(`🔍 Checked ${users.length} users: ${expiredCount} expired, ${aboutToExpireCount} about to expire`);
            
            return {
                success: true,
                totalChecked: users.length,
                expired: expiredCount,
                aboutToExpire: aboutToExpireCount,
                results: results
            };
            
        } catch (error) {
            console.error('Error checking expired users:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ลบ users ที่หมดอายุ (พร้อม backup)
    cleanupExpiredUsers() {
        try {
            const users = this.getAllUsers();
            const now = Date.now();
            let deletedCount = 0;
            const deletedUsers = [];
            
            // สร้าง backup directory สำหรับ expired users
            const expiredBackupDir = path.join(this.USER_DATA_DIR, 'expired_backups');
            if (!fs.existsSync(expiredBackupDir)) {
                fs.mkdirSync(expiredBackupDir, { recursive: true });
            }

            users.forEach(userInfo => {
                const userData = this.loadUserData(userInfo.username);
                
                // ตรวจสอบ rental users ที่หมดอายุ
                if (userData.rental && userData.rental.isRental && userData.rental.isExpired) {
                    const username = userInfo.username;
                    
                    // สำรองข้อมูลก่อนลบ
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const backupFileName = `${username}_expired_${timestamp}.json`;
                    const backupPath = path.join(expiredBackupDir, backupFileName);
                    
                    // เพิ่มข้อมูลการลบ
                    userData.deletedAt = now;
                    userData.deletedReason = 'Rental expired';
                    userData.backupPath = backupPath;
                    
                    // บันทึก backup
                    fs.writeFileSync(backupPath, JSON.stringify(userData, null, 2));
                    
                    // ลบไฟล์ต้นฉบับ
                    const userPath = this.getUserDataPath(username);
                    fs.unlinkSync(userPath);
                    
                    deletedCount++;
                    deletedUsers.push({
                        username: username,
                        expiredAt: userData.rental.expiresAt,
                        backupPath: backupPath
                    });
                    
                    console.log(`🗑️ Deleted expired user: ${username} (backup: ${backupFileName})`);
                }
            });

            console.log(`🧹 Cleanup completed: ${deletedCount} expired users deleted`);
            
            return {
                success: true,
                deletedCount: deletedCount,
                deletedUsers: deletedUsers
            };
            
        } catch (error) {
            console.error('Error cleaning up expired users:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ต่ออายุ user
    extendUserRental(username, additionalDays) {
        try {
            const userData = this.loadUserData(username);
            
            if (!userData.rental || !userData.rental.isRental) {
                throw new Error('User is not a rental user');
            }

            const now = Date.now();
            const currentExpiry = userData.rental.expiresAt;
            
            // คำนวณวันหมดอายุใหม่ (จากวันหมดอายุเดิม หรือวันปัจจุบันถ้าหมดอายุแล้ว)
            const baseTime = currentExpiry > now ? currentExpiry : now;
            const newExpiresAt = baseTime + (additionalDays * 24 * 60 * 60 * 1000);
            
            userData.rental.expiresAt = newExpiresAt;
            userData.rental.expiresAtFormatted = new Date(newExpiresAt).toLocaleString('th-TH', {
                timeZone: 'Asia/Bangkok',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            userData.rental.isExpired = false;
            userData.rental.rentalDays += additionalDays;
            userData.rental.lastExtendedAt = now;
            userData.rental.lastExtendedDays = additionalDays;

            this.saveUserData(username, userData);
            
            console.log(`📅 Extended rental for ${username}: +${additionalDays} days, new expiry: ${userData.rental.expiresAtFormatted}`);
            
            return {
                success: true,
                username: username,
                additionalDays: additionalDays,
                newExpiresAt: newExpiresAt,
                newExpiresAtFormatted: userData.rental.expiresAtFormatted
            };
            
        } catch (error) {
            console.error(`Error extending rental for ${username}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}



module.exports = UserManager;