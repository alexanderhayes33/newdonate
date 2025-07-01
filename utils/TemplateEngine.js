// utils/TemplateEngine.js - Fixed Version
const fs = require('fs');
const path = require('path');

class TemplateEngine {
    constructor() {
        this.TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
        this.cache = new Map();
        
        console.log(`📁 Templates directory: ${this.TEMPLATES_DIR}`);
        
        // ตรวจสอบว่า templates directory มีอยู่หรือไม่
        this.ensureTemplatesDirectory();
    }

    ensureTemplatesDirectory() {
        if (!fs.existsSync(this.TEMPLATES_DIR)) {
            console.log(`❌ Templates directory not found: ${this.TEMPLATES_DIR}`);
            console.log(`🔧 Creating templates directory...`);
            
            try {
                fs.mkdirSync(this.TEMPLATES_DIR, { recursive: true });
                console.log(`✅ Created templates directory`);
            } catch (error) {
                console.error(`❌ Failed to create templates directory:`, error);
            }
        } else {
            console.log(`✅ Templates directory exists`);
            
            // แสดงรายชื่อไฟล์ใน templates directory
            try {
                const files = fs.readdirSync(this.TEMPLATES_DIR);
                console.log(`📄 Template files found:`, files);
            } catch (error) {
                console.error(`❌ Cannot read templates directory:`, error);
            }
        }
    }

    loadTemplate(templateName) {
        // ตรวจสอบ cache ก่อน
        if (this.cache.has(templateName)) {
            console.log(`📄 Using cached template: ${templateName}`);
            return this.cache.get(templateName);
        }

        try {
            const templatePath = path.join(this.TEMPLATES_DIR, `${templateName}.html`);
            console.log(`📄 Attempting to load template: ${templatePath}`);
            
            // ตรวจสอบว่าไฟล์มีอยู่จริงหรือไม่
            if (!fs.existsSync(templatePath)) {
                console.error(`❌ Template file not found: ${templatePath}`);
                
                // แสดงไฟล์ที่มีอยู่ใน directory
                try {
                    const availableFiles = fs.readdirSync(this.TEMPLATES_DIR);
                    console.log(`📋 Available template files:`, availableFiles);
                } catch (dirError) {
                    console.error(`❌ Cannot read templates directory:`, dirError);
                }
                
                return null;
            }
            
            // อ่านไฟล์
            const templateContent = fs.readFileSync(templatePath, 'utf8');
            console.log(`✅ Template loaded successfully: ${templateName} (${templateContent.length} chars)`);
            
            // เก็บใน cache
            this.cache.set(templateName, templateContent);
            return templateContent;
            
        } catch (error) {
            console.error(`❌ Error loading template ${templateName}:`, error);
            return null;
        }
    }

    render(templateName, variables = {}) {
        console.log(`🎨 Rendering template: ${templateName}`);
        console.log(`📋 Variables:`, Object.keys(variables));
        
        const template = this.loadTemplate(templateName);
        
        if (!template) {
            console.error(`❌ Cannot render template: ${templateName}`);
            return `
                <html>
                <head><meta charset="UTF-8"><title>Template Error</title></head>
                <body style="font-family: Arial; padding: 50px; text-align: center;">
                    <h1>❌ Template Not Found</h1>
                    <p>Template "${templateName}" could not be loaded</p>
                    <p>Expected location: ${this.TEMPLATES_DIR}/${templateName}.html</p>
                    <button onclick="history.back()">← Go Back</button>
                </body>
                </html>
            `;
        }

        let rendered = template;
        
        try {
            // แทนที่ {{{ variable }}} (raw HTML - ไม่ escape) ก่อน
            for (const [key, value] of Object.entries(variables)) {
                const rawRegex = new RegExp(`{{{\\s*${key}\\s*}}}`, 'g');
                if (rawRegex.test(rendered)) {
                    rendered = rendered.replace(rawRegex, String(value));
                    console.log(`✅ Replaced {{{ ${key} }}} with raw HTML (${String(value).length} chars)`);
                }
            }

            // แทนที่ {{ variable }} (escaped HTML) หลัง
            for (const [key, value] of Object.entries(variables)) {
                const escapedRegex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
                if (escapedRegex.test(rendered)) {
                    const escapedValue = this.escapeHtml(value);
                    rendered = rendered.replace(escapedRegex, escapedValue);
                    console.log(`✅ Replaced {{ ${key} }} with: ${String(value).substring(0, 50)}${String(value).length > 50 ? '...' : ''}`);
                }
            }

            console.log(`✅ Template rendered successfully: ${templateName}`);
            return rendered;
            
        } catch (error) {
            console.error(`❌ Error rendering template ${templateName}:`, error);
            return `<h1>Template Rendering Error</h1><pre>${error.message}</pre>`;
        }
    }

    escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
            return String(unsafe);
        }
        
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    clearCache() {
        this.cache.clear();
        console.log('🧹 Template cache cleared');
    }

    // เพิ่มฟังก์ชันสำหรับ debug
    debugInfo() {
        console.log('🔍 TemplateEngine Debug Info:');
        console.log(`📁 Templates Directory: ${this.TEMPLATES_DIR}`);
        console.log(`📁 Directory exists: ${fs.existsSync(this.TEMPLATES_DIR)}`);
        
        try {
            const files = fs.readdirSync(this.TEMPLATES_DIR);
            console.log(`📄 Available templates: ${files.join(', ')}`);
        } catch (error) {
            console.log(`❌ Cannot read directory: ${error.message}`);
        }
        
        console.log(`💾 Cached templates: ${Array.from(this.cache.keys()).join(', ')}`);
    }
}

module.exports = TemplateEngine;