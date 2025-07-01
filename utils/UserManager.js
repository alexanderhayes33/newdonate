// utils/UserManager.js - Class สำหรับจัดการข้อมูล Users

const fs = require('fs');
const path = require('path');

class UserManager {
    constructor() {
        this.USER_DATA_DIR = path.join(__dirname, '..', 'users');
        this.ensureUserDirectory();
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
                console.log(`📖 Loaded data for user: ${username}`);
                return data;
            }
        } catch (error) {
            console.error(`❌ Error loading user data for ${username}:`, error);
        }
        
        // สร้างข้อมูล default ถ้าไม่มี
        const defaultData = this.createDefaultUserData(username);
        this.saveUserData(username, defaultData);
        return defaultData;
    }

    // สร้างข้อมูล user เริ่มต้น
    createDefaultUserData(username) {
        return {
            username: username,
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
            
            // การตั้งค่า
            config: {
                truewalletPhone: '',
                streamTitle: `${username}'s Stream`,
                alertDuration: 5000,
                enableTTS: true,
                enableSound: true,
                alertPosition: 'top',
                customCSS: '',
                welcomeMessage: `ยินดีต้อนรับสู่สตรีมของ ${username}!`
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
                lastDonationAt: null
            },
            
            // การตั้งค่าขั้นสูง
            advanced: {
                webhookUrl: '',
                discordWebhook: '',
                customAlerts: {
                    milestone100: true,
                    milestone500: true,
                    milestone1000: true
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
    createUser(username, initialConfig = {}) {
        const validation = this.validateUsername(username);
        
        if (!validation.isValid) {
            throw new Error(`Invalid username: ${validation.errors.join(', ')}`);
        }

        if (this.userExists(username)) {
            throw new Error(`User '${username}' already exists`);
        }

        const userData = this.createDefaultUserData(username);
        
        // ใส่ config เริ่มต้น
        if (initialConfig.truewalletPhone) {
            userData.config.truewalletPhone = initialConfig.truewalletPhone;
        }
        if (initialConfig.streamTitle) {
            userData.config.streamTitle = initialConfig.streamTitle;
        }

        this.saveUserData(username, userData);
        
        console.log(`✅ Created new user: ${username}`);
        return userData;
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
            voucherCode: donationData.voucherCode || '',
            phoneNumber: donationData.phoneNumber || '',
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

        console.log(`💰 New donation for ${username}: ${donation.name} - ฿${donation.amount}`);
        return donation;
    }

    // อัพเดทสถิติ
    updateStats(userData) {
        const donations = userData.donations;
        
        userData.stats.totalDonations = donations.length;
        userData.stats.totalAmount = donations.reduce((sum, d) => sum + d.amount, 0);
        userData.stats.averageAmount = donations.length > 0 ? 
            Math.round(userData.stats.totalAmount / donations.length) : 0;
        userData.stats.highestDonation = donations.length > 0 ? 
            Math.max(...donations.map(d => d.amount)) : 0;
        
        // นับ unique donors
        const uniqueDonors = new Set(donations.map(d => d.name.toLowerCase()));
        userData.stats.uniqueDonors = uniqueDonors.size;
        
        // จำนวนเงินเดือนนี้
        const thisMonth = new Date();
        const startOfMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1);
        userData.stats.thisMonthAmount = donations
            .filter(d => new Date(d.timestamp) >= startOfMonth)
            .reduce((sum, d) => sum + d.amount, 0);
        
        // การสนับสนุนล่าสุด
        userData.stats.lastDonationAt = donations.length > 0 ? donations[0].timestamp : null;
    }

    // อัพเดทการตั้งค่า
    updateConfig(username, newConfig) {
        const userData = this.loadUserData(username);
        userData.config = { ...userData.config, ...newConfig };
        this.saveUserData(username, userData);
        
        console.log(`⚙️ Updated config for ${username}`);
        return userData.config;
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
                        createdAt: userData.createdAt
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
                fs.unlinkSync(userPath);
                console.log(`🗑️ Deleted user: ${username}`);
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
        
        return {
            totalUsers: users.length,
            totalDonations: users.reduce((sum, u) => sum + u.totalDonations, 0),
            totalAmount: users.reduce((sum, u) => sum + u.totalAmount, 0),
            activeUsers: users.filter(u => Date.now() - u.lastActiveAt < 7 * 24 * 60 * 60 * 1000).length, // active ใน 7 วัน
            topUsers: users
                .sort((a, b) => b.totalAmount - a.totalAmount)
                .slice(0, 5)
                .map(u => ({
                    username: u.username,
                    streamTitle: u.streamTitle,
                    totalAmount: u.totalAmount
                }))
        };
    }
}

module.exports = UserManager;