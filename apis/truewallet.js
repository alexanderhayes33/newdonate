const fetch = require('axios');
const tls = require("tls");

tls.DEFAULT_MIN_VERSION = "TLSv1.3";

module.exports = {
    redeemvouchers: async function (phone_number, voucher_code) {
        try {
            // ลบ URL prefix ถ้ามี
            voucher_code = voucher_code.replace('https://gift.truemoney.com/campaign/?v=','');
            
            console.log('📝 ข้อมูลที่จะส่ง:', { phone_number, voucher_code });
            
            let res;
            
            // ตรวจสอบ voucher code
            if(!/^[a-z0-9]*$/i.test(voucher_code)) {
                res = {
                    status: 'FAIL',
                    reason: 'Voucher code ต้องมีเฉพาะตัวอักษรภาษาอังกฤษและตัวเลขเท่านั้น'
                };
                return res;
            }
            
            if(voucher_code.length <= 0) {
                res = {
                    status: 'FAIL',
                    reason: 'กรุณากรอก voucher code'
                };
                return res;
            }
            
            const data = {
                mobile: `${phone_number}`,
                voucher_hash: `${voucher_code}`
            };
            
            console.log('🌐 กำลังส่งข้อมูลไปยัง TrueWallet API...');
            
            const response = await fetch({
                method: 'POST',
                url: `https://gift.truemoney.com/campaign/vouchers/${voucher_code}/redeem`,
                headers: { 
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                data: JSON.stringify(data),
                timeout: 30000 // 30 วินาที
            });
            
            console.log('📋 Response status:', response.status);
            console.log('📋 Response headers:', response.headers);
            console.log('📋 Response data:', response.data);
            
            // ตรวจสอบการตอบกลับ
            if (!response.data) {
                return {
                    status: 'FAIL',
                    reason: 'ไม่ได้รับข้อมูลตอบกลับจาก TrueWallet'
                };
            }
            
            const resjson = response.data;
            
            // ตรวจสอบโครงสร้างข้อมูล
            if (!resjson.status) {
                console.log('❌ ข้อมูลตอบกลับไม่มี status field:', resjson);
                return {
                    status: 'FAIL',
                    reason: 'รูปแบบข้อมูลตอบกลับไม่ถูกต้อง'
                };
            }
            
            // ตรวจสอบความสำเร็จ
            if (resjson.status.code === 'SUCCESS') {
                const amount = resjson.data && resjson.data.voucher 
                    ? parseInt(resjson.data.voucher.redeemed_amount_baht) 
                    : 0;
                    
                res = {
                    status: 'SUCCESS',
                    amount: amount
                };
                console.log('✅ เติมเงินสำเร็จ:', res);
                return res;
            } else {
                res = {
                    status: 'FAIL',
                    reason: resjson.status.message || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'
                };
                console.log('❌ เติมเงินไม่สำเร็จ:', res);
                return res;
            }
            
        } catch (error) {
            console.error('❌ เกิดข้อผิดพลาดใน redeemvouchers:', error);
            
            // ตรวจสอบประเภทของ error
            if (error.response) {
                // Server ตอบกลับแต่มี error status
                console.log('📋 Error response status:', error.response.status);
                console.log('📋 Error response data:', error.response.data);
                
                return {
                    status: 'FAIL',
                    reason: `เซิร์ฟเวอร์ตอบกลับด้วย status ${error.response.status}: ${error.response.data?.message || 'ไม่ทราบสาเหตุ'}`
                };
            } else if (error.request) {
                // ส่ง request ไปแล้วแต่ไม่ได้รับการตอบกลับ
                console.log('📋 No response received:', error.request);
                return {
                    status: 'FAIL',
                    reason: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ TrueWallet ได้'
                };
            } else {
                // Error อื่นๆ
                return {
                    status: 'FAIL',
                    reason: `เกิดข้อผิดพลาด: ${error.message}`
                };
            }
        }
    }
};