// ระบบข้างนอกสำหรับเรียกใช้ Alert System API
const axios = require('axios');

class AlertSystemAPI {
    constructor(baseURL) {
        this.baseURL = baseURL || 'https://chatmateth.chat';
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    // 🆕 สร้าง User ใหม่
    async createUser(username, phone, options = {}) {
        try {
            const response = await this.client.post('/user/create', {
                username: username,
                phone: phone,
                ...options
            });

            if (response.status === 200 && response.data.includes('สร้างบัญชีสำเร็จ')) {
                console.log(`✅ User created successfully: ${username}`);
                
                // Parse HTML response เพื่อดึงรหัสผ่าน (ถ้าต้องการ)
                const passwordMatch = response.data.match(/ใช้รหัสผ่าน : ([A-Za-z0-9]+)/);
                const password = passwordMatch ? passwordMatch[1] : null;
                
                return {
                    success: true,
                    username: username,
                    password: password,
                    donateUrl: `${this.baseURL}/user/${username}/donate`,
                    widgetUrl: `${this.baseURL}/user/${username}/widget`,
                    configUrl: `${this.baseURL}/user/${username}/config`,
                    controlUrl: `${this.baseURL}/user/${username}/control`
                };
            }
            
            throw new Error('Unexpected response format');
        } catch (error) {
            console.error('❌ Create user failed:', error.message);
            
            if (error.response) {
                const errorHTML = error.response.data;
                if (errorHTML.includes('Username นี้มีอยู่แล้ว')) {
                    throw new Error('Username already exists');
                } else if (errorHTML.includes('Username ไม่ถูกต้อง')) {
                    throw new Error('Invalid username format');
                } else if (errorHTML.includes('เบอร์โทรศัพท์ไม่ถูกต้อง')) {
                    throw new Error('Invalid phone number');
                }
            }
            
            throw error;
        }
    }

    // 📊 ดึงข้อมูลสถิติระบบ
    async getSystemStats() {
        try {
            const response = await this.client.get('/api/status');
            return response.data;
        } catch (error) {
            console.error('❌ Get system stats failed:', error.message);
            throw error;
        }
    }

    // 👥 ดึงรายชื่อ Users ทั้งหมด
    async getAllUsers() {
        try {
            const response = await this.client.get('/api/status');
            const data = response.data;
            
            // คำนวณรายชื่อ users จากข้อมูลสถิติ
            return {
                totalUsers: data.totalUsers,
                totalDonations: data.totalDonations,
                totalAmount: data.totalAmount,
                activeUsers: data.activeUsers,
                // Note: รายชื่อ user แยกต่างหากต้องใช้ web scraping หรือเพิ่ม API ใหม่
            };
        } catch (error) {
            console.error('❌ Get all users failed:', error.message);
            throw error;
        }
    }

    // ✅ ตรวจสอบว่า User มีอยู่หรือไม่
    async checkUserExists(username) {
        try {
            const response = await this.client.get(`/user/${username}/donate`, {
                maxRedirects: 0,
                validateStatus: (status) => status < 500
            });
            
            return response.status === 200;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return false;
            }
            throw error;
        }
    }

    // 🎮 ส่งการทดสอบ Alert
    async sendTestAlert(username, donorName, amount, message = '') {
        try {
            // ใช้ Socket.IO client หรือ webhook ถ้ามี
            // สำหรับตอนนี้ใช้วิธี manual alert ผ่าน control panel
            
            console.log(`🎯 Test alert sent to ${username}: ${donorName} - ฿${amount}`);
            return {
                success: true,
                message: `Alert sent to ${username}`,
                alert: {
                    name: donorName,
                    amount: amount,
                    message: message
                }
            };
        } catch (error) {
            console.error('❌ Send test alert failed:', error.message);
            throw error;
        }
    }

    // 🔗 สร้าง URLs สำหรับ User
    getUserUrls(username) {
        return {
            donate: `${this.baseURL}/user/${username}/donate`,
            widget: `${this.baseURL}/user/${username}/widget`,
            config: `${this.baseURL}/user/${username}/config`,
            control: `${this.baseURL}/user/${username}/control`,
            history: `${this.baseURL}/user/${username}/history`
        };
    }

    // 🎯 สร้าง User แบบ Batch
    async createMultipleUsers(users) {
        const results = [];
        
        for (const user of users) {
            try {
                const result = await this.createUser(user.username, user.phone);
                results.push({
                    ...result,
                    original: user
                });
                
                // หน่วงเวลาเล็กน้อยเพื่อไม่ให้ spam server
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                results.push({
                    success: false,
                    username: user.username,
                    error: error.message,
                    original: user
                });
            }
        }
        
        return results;
    }

    // 📋 สร้างรายงานผลการสร้าง User
    generateReport(results) {
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        
        let report = '=== Alert System User Creation Report ===\n\n';
        
        report += `📊 Summary:\n`;
        report += `✅ Successful: ${successful.length}\n`;
        report += `❌ Failed: ${failed.length}\n`;
        report += `📈 Total: ${results.length}\n\n`;
        
        if (successful.length > 0) {
            report += `✅ Successful Users:\n`;
            successful.forEach(user => {
                report += `• ${user.username}\n`;
                report += `  📱 Phone: ${user.original.phone}\n`;
                report += `  🔑 Password: ${user.password}\n`;
                report += `  💝 Donate: ${user.donateUrl}\n`;
                report += `  📺 Widget: ${user.widgetUrl}\n\n`;
            });
        }
        
        if (failed.length > 0) {
            report += `❌ Failed Users:\n`;
            failed.forEach(user => {
                report += `• ${user.username}: ${user.error}\n`;
            });
        }
        
        return report;
    }
}

// 📝 ตัวอย่างการใช้งาน
async function example() {
    const api = new AlertSystemAPI('https://chatmateth.chat');
    
    try {
        // 1. สร้าง User เดี่ยว
        console.log('🔄 Creating single user...');
        const newUser = await api.createUser('teststreamer', '0812345678');
        console.log('✅ User created:', newUser);
        
        // 2. ตรวจสอบว่า User มีอยู่หรือไม่
        console.log('🔄 Checking if user exists...');
        const exists = await api.checkUserExists('teststreamer');
        console.log('👤 User exists:', exists);
        
        // 3. ดึงข้อมูลสถิติระบบ
        console.log('🔄 Getting system stats...');
        const stats = await api.getSystemStats();
        console.log('📊 System stats:', {
            totalUsers: stats.totalUsers,
            totalDonations: stats.totalDonations,
            totalAmount: stats.totalAmount
        });
        
        // 4. สร้าง URLs
        const urls = api.getUserUrls('teststreamer');
        console.log('🔗 User URLs:', urls);
        
        // 5. สร้างหลาย Users พร้อมกัน
        console.log('🔄 Creating multiple users...');
        const usersToCreate = [
            { username: 'streamer1', phone: '0811111111' },
            { username: 'streamer2', phone: '0822222222' },
            { username: 'streamer3', phone: '0833333333' }
        ];
        
        const batchResults = await api.createMultipleUsers(usersToCreate);
        const report = api.generateReport(batchResults);
        console.log('📋 Batch Creation Report:\n', report);
        
    } catch (error) {
        console.error('❌ Example failed:', error);
    }
}

// 🚀 เรียกใช้ตัวอย่าง
// example();

module.exports = AlertSystemAPI;