// ===================================================================
// HMAS - الخادم النهائي (الإصدار 2.0 - مع better-sqlite3)
// ===================================================================

// --- 1. استيراد المكتبات الأساسية والجديدة ---
const express = require('express');
// (تغيير) استيراد المكتبة الجديدة
const Database = require('better-sqlite3'); 
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- 2. إعدادات التطبيق الأساسية ---
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'f9$Kz7!qW#8rT&uP3@xL^2mB%0sV?=';
const ADMIN_ID = '781293367';
const ADMIN_NAME = 'Hameed Alsamei';
const ADMIN_PASSWORD = 'f9$Kz7!qW#8rT&uP3@xL^2mB%0sV?=';

// --- 3. إعدادات الوسيط (Middleware) ---
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// --- 4. إعداد Multer لتخزين الملفات ---
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: function (req, file, cb) {
        cb(null, 'file-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- 5. الاتصال بقاعدة البيانات وإنشاء الجداول ---
// (تغيير) طريقة الاتصال الجديدة
const db = new Database('./database.db', { verbose: console.log });
console.log('Connected to the HMAS database using better-sqlite3.');

// (تغيير) طريقة تنفيذ الأوامر المتسلسلة
const setupDb = () => {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, student_id TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sections (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, icon TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY AUTOINCREMENT, section_id INTEGER NOT NULL, display_name TEXT NOT NULL, file_path TEXT NOT NULL, new_until DATE, FOREIGN KEY (section_id) REFERENCES sections (id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS news (id INTEGER PRIMARY KEY, content TEXT);
        CREATE TABLE IF NOT EXISTS ads (id INTEGER PRIMARY KEY, ad_code TEXT);
    `);

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, salt);
    
    const stmtUser = db.prepare(`INSERT OR IGNORE INTO users (name, student_id, password) VALUES (?, ?, ?)`);
    stmtUser.run(ADMIN_NAME, ADMIN_ID, hashedPassword);

    const stmtNews = db.prepare("INSERT OR IGNORE INTO news (id, content) VALUES (1, 'مرحباً بكم في بوابة HMAS الطلابية!')");
    stmtNews.run();

    const stmtAds = db.prepare("INSERT OR IGNORE INTO ads (id, ad_code) VALUES (1, '<p>مكان الإعلان</p>')");
    stmtAds.run();
};
setupDb();


// --- 6. دالة حماية الروابط (لا تغيير) ---
const protect = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded.id === ADMIN_ID) {
                req.user = decoded;
                next();
            } else {
                res.status(403).json({ message: 'Forbidden: Not an admin' });
            }
        } catch (error) {
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    } else {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

// --- 7. نقاط النهاية (API Endpoints) ---

// (تغيير) طريقة كتابة نقاط النهاية لتناسب المكتبة الجديدة
app.post('/api/admin/login', (req, res) => {
    try {
        const { student_id, password } = req.body;
        if (student_id !== ADMIN_ID) {
            return res.status(401).json({ message: 'بيانات الاعتماد غير صحيحة' });
        }
        const stmt = db.prepare(`SELECT * FROM users WHERE student_id = ?`);
        const user = stmt.get(student_id);

        if (user && bcrypt.compareSync(password, user.password)) {
            const token = jwt.sign({ id: user.student_id, name: user.name }, JWT_SECRET, { expiresIn: '1d' });
            res.json({ success: true, token });
        } else {
            res.status(401).json({ message: 'بيانات الاعتماد غير صحيحة' });
        }
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.post('/api/student/login', (req, res) => {
    try {
        const { student_id, password } = req.body;
        const stmt = db.prepare(`SELECT * FROM users WHERE student_id = ?`);
        const user = stmt.get(student_id);

        if (user && bcrypt.compareSync(password, user.password)) {
            const token = jwt.sign({ id: user.id, name: user.name, student_id: user.student_id }, JWT_SECRET, { expiresIn: '1d' });
            res.json({ success: true, token, user: { id: user.id, name: user.name, student_id: user.student_id } });
        } else {
            res.status(401).json({ message: 'رقم الطالب أو كلمة المرور غير صحيحة' });
        }
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.post('/api/register', (req, res) => {
    try {
        const { name, student_id, password } = req.body;
        if (!name || !student_id || !password) {
            return res.status(400).json({ message: 'يرجى ملء جميع الحقول' });
        }
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(password, salt);
        const stmt = db.prepare(`INSERT INTO users (name, student_id, password) VALUES (?, ?, ?)`);
        const info = stmt.run(name, student_id, hashedPassword);
        res.status(201).json({ success: true, message: 'تم إنشاء الحساب بنجاح!', userId: info.lastInsertRowid });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ message: 'رقم الطالب هذا مسجل بالفعل' });
        }
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.get('/api/sections', (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const sql = `
            SELECT s.*, (SELECT COUNT(f.id) FROM files f WHERE f.section_id = s.id AND date(f.new_until) >= date(?)) as new_files_count
            FROM sections s
        `;
        const stmt = db.prepare(sql);
        const sections = stmt.all(today);
        res.json({ success: true, sections });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.get('/api/news', (req, res) => {
    try {
        const stmt = db.prepare(`SELECT * FROM news WHERE id = 1`);
        const news = stmt.get();
        res.json({ success: true, news });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.get('/api/ads', (req, res) => {
    try {
        const stmt = db.prepare(`SELECT * FROM ads WHERE id = 1`);
        const ads = stmt.get();
        res.json({ success: true, ads });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

// --- نقاط نهاية المدير (محمية) ---
app.post('/api/sections', protect, (req, res) => {
    try {
        const { title, description, icon } = req.body;
        const stmt = db.prepare(`INSERT INTO sections (title, description, icon) VALUES (?, ?, ?)`);
        const info = stmt.run(title, description, icon);
        res.status(201).json({ success: true, message: 'تم إنشاء القسم', sectionId: info.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.put('/api/sections/:id', protect, (req, res) => {
    try {
        const { title, description, icon } = req.body;
        const stmt = db.prepare(`UPDATE sections SET title = ?, description = ?, icon = ? WHERE id = ?`);
        stmt.run(title, description, icon, req.params.id);
        res.json({ success: true, message: 'تم تحديث القسم' });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.delete('/api/sections/:id', protect, (req, res) => {
    try {
        // (مهم) حذف الملفات المرتبطة من الخادم أولاً
        const filesToDelete = db.prepare('SELECT file_path FROM files WHERE section_id = ?').all(req.params.id);
        filesToDelete.forEach(file => {
            if (fs.existsSync(file.file_path)) {
                fs.unlinkSync(file.file_path);
            }
        });
        const stmt = db.prepare(`DELETE FROM sections WHERE id = ?`);
        stmt.run(req.params.id);
        res.json({ success: true, message: 'تم حذف القسم وكل ملفاته' });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.get('/api/sections/:id', protect, (req, res) => {
    try {
        const sectionId = req.params.id;
        const today = new Date().toISOString();
        const section = db.prepare(`SELECT * FROM sections WHERE id = ?`).get(sectionId);
        if (!section) return res.status(404).json({ message: 'Section not found' });
        
        const files = db.prepare(`SELECT *, (new_until > ?) as is_new FROM files WHERE section_id = ?`).all(today, sectionId);
        res.json({ success: true, section, files });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.post('/api/sections/:id/files', protect, upload.single('file'), (req, res) => {
    try {
        const sectionId = req.params.id;
        const { displayName, newDuration } = req.body;
        const filePath = req.file.path;
        let newUntil = null;
        if (newDuration && parseInt(newDuration) > 0) {
            const date = new Date();
            date.setDate(date.getDate() + parseInt(newDuration));
            newUntil = date.toISOString().split('T')[0];
        }
        const stmt = db.prepare(`INSERT INTO files (section_id, display_name, file_path, new_until) VALUES (?, ?, ?, ?)`);
        const info = stmt.run(sectionId, displayName, filePath, newUntil);
        res.json({ success: true, message: 'تم رفع الملف بنجاح!', fileId: info.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.delete('/api/files/:id', protect, (req, res) => {
    try {
        const file = db.prepare('SELECT file_path FROM files WHERE id = ?').get(req.params.id);
        if (file && fs.existsSync(file.file_path)) {
            fs.unlinkSync(file.file_path);
        }
        const stmt = db.prepare(`DELETE FROM files WHERE id = ?`);
        stmt.run(req.params.id);
        res.json({ success: true, message: 'تم حذف الملف' });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.get('/api/users', protect, (req, res) => {
    try {
        const stmt = db.prepare(`SELECT id, name, student_id, password FROM users`);
        const users = stmt.all();
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.put('/api/users/:id', protect, (req, res) => {
    try {
        const { name, student_id, password } = req.body;
        if (password && password.length > 0) {
            const salt = bcrypt.genSaltSync(10);
            const hashedPassword = bcrypt.hashSync(password, salt);
            db.prepare(`UPDATE users SET name = ?, student_id = ?, password = ? WHERE id = ?`).run(name, student_id, hashedPassword, req.params.id);
        } else {
            db.prepare(`UPDATE users SET name = ?, student_id = ? WHERE id = ?`).run(name, student_id, req.params.id);
        }
        res.json({ success: true, message: 'تم تحديث بيانات الطالب' });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.delete('/api/users/:id', protect, (req, res) => {
    try {
        db.prepare(`DELETE FROM users WHERE id = ?`).run(req.params.id);
        res.json({ success: true, message: 'تم حذف الطالب' });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.post('/api/news', protect, (req, res) => {
    try {
        db.prepare(`UPDATE news SET content = ? WHERE id = 1`).run(req.body.content);
        res.json({ success: true, message: 'تم تحديث الأخبار' });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});

app.post('/api/ads', protect, (req, res) => {
    try {
        db.prepare(`UPDATE ads SET ad_code = ? WHERE id = 1`).run(req.body.ad_code);
        res.json({ success: true, message: 'تم تحديث الإعلان' });
    } catch (err) {
        res.status(500).json({ message: 'خطأ في الخادم' });
    }
});


// --- 8. تشغيل الخادم ---
app.listen(PORT, () => {
    console.log(`Server is running securely on http://localhost:${PORT}`);
});
