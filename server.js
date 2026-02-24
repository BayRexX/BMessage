const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static("public"));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const SECRET = "bmessage_secret_key";
const USERS_FILE = path.join(__dirname, "users.json");
const POSTS_FILE = path.join(__dirname, "posts.json");
const CHATS_FILE = path.join(__dirname, "chats.json");
const GROUPS_FILE = path.join(__dirname, "groups.json");
const NOTIFICATIONS_FILE = path.join(__dirname, "notifications.json");

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext);
        const cleanName = name.replace(/[^a-z0-9а-яё]/gi, '_');
        cb(null, `${uniqueSuffix}-${cleanName}${ext}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Загрузка данных
let users = [];
let posts = [];
let chats = [];
let groups = [];
let notifications = [];

if (fs.existsSync(USERS_FILE)) {
    try {
        users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch (e) {
        users = [];
    }
}

if (fs.existsSync(POSTS_FILE)) {
    try {
        posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
    } catch (e) {
        posts = [];
    }
}

if (fs.existsSync(CHATS_FILE)) {
    try {
        chats = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8'));
    } catch (e) {
        chats = [];
    }
}

if (fs.existsSync(GROUPS_FILE)) {
    try {
        groups = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8'));
    } catch (e) {
        groups = [];
    }
}

if (fs.existsSync(NOTIFICATIONS_FILE)) {
    try {
        notifications = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
    } catch (e) {
        notifications = [];
    }
}

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function savePosts() {
    fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
}

function saveChats() {
    fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));
}

function saveGroups() {
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(groups, null, 2));
}

function saveNotifications() {
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
}

// Обновление времени последнего визита
function updateLastSeen(userId) {
    const user = users.find(u => u.id === userId);
    if (user) {
        user.lastSeen = Date.now();
        saveUsers();
    }
}

// Главная
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/auth.html"));
});

// Регистрация
app.post("/register", async (req, res) => {
    const { email, password } = req.body;

    if (users.find(u => u.email === email)) {
        return res.status(400).json({ message: "Пользователь уже существует" });
    }

    const hash = await bcrypt.hash(password, 10);
    const newUser = { 
        id: Date.now().toString(),
        email, 
        password: hash,
        name: email.split('@')[0],
        avatar: '',
        registered: Date.now(),
        lastSeen: Date.now(),
        settings: {
            hideAvatar: false,
            hideEmail: false,
            hideName: false,
            theme: 'light'
        }
    };
    
    users.push(newUser);
    saveUsers();

    res.json({ message: "Регистрация успешна" });
});

// Вход
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    const user = users.find(u => u.email === email);
    if (!user) return res.status(400).json({ message: "Пользователь не найден" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: "Неверный пароль" });

    updateLastSeen(user.id);
    
    const token = jwt.sign({ email, id: user.id }, SECRET, { expiresIn: "30d" });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, settings: user.settings } });
});

// Получить свой профиль
app.get("/profile", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        updateLastSeen(decoded.id);
        
        const user = users.find(u => u.id === decoded.id);
        
        if (!user) return res.status(404).json({ message: "Пользователь не найден" });
        
        const { password, ...userData } = user;
        
        const userPosts = posts.filter(p => p.userId === decoded.id).sort((a, b) => b.timestamp - a.timestamp);
        
        res.json({ ...userData, posts: userPosts });
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Получить профиль другого пользователя по ID
app.get("/profile/:id", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        const user = users.find(u => u.id === req.params.id);
        
        if (!user) return res.status(404).json({ message: "Пользователь не найден" });
        
        const { password, settings, email, ...userData } = user;
        
        const userPosts = posts.filter(p => p.userId === req.params.id).sort((a, b) => b.timestamp - a.timestamp);
        
        res.json({ ...userData, posts: userPosts });
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Обновить профиль
app.post("/profile/update", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        const user = users.find(u => u.id === decoded.id);
        if (!user) return res.status(404).json({ message: "Пользователь не найден" });
        
        Object.assign(user, req.body);
        saveUsers();
        
        const { password, ...userData } = user;
        res.json(userData);
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Сохранить настройки
app.post("/settings", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        const user = users.find(u => u.id === decoded.id);
        if (!user) return res.status(404).json({ message: "Пользователь не найден" });
        
        user.settings = { ...user.settings, ...req.body };
        saveUsers();
        
        res.json({ success: true, settings: user.settings });
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Посты
app.get("/posts", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        updateLastSeen(decoded.id);
        
        const allPosts = posts.map(post => {
            const user = users.find(u => u.id === post.userId);
            return {
                ...post,
                user: user ? { 
                    id: user.id, 
                    name: user.name, 
                    avatar: user.avatar,
                    settings: user.settings 
                } : null
            };
        }).sort((a, b) => b.timestamp - a.timestamp);
        
        res.json(allPosts);
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

app.post("/posts", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        const user = users.find(u => u.id === decoded.id);
        if (!user) return res.status(404).json({ message: "Пользователь не найден" });
        
        const newPost = {
            id: Date.now().toString(),
            userId: user.id,
            text: req.body.text || '',
            image: req.body.image || '',
            timestamp: Date.now(),
            likes: [],
            comments: []
        };
        
        posts.push(newPost);
        savePosts();
        
        res.json(newPost);
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Редактировать пост
app.put("/posts/:id", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        const post = posts.find(p => p.id === req.params.id);
        
        if (!post) return res.status(404).json({ message: "Пост не найден" });
        if (post.userId !== decoded.id) return res.status(403).json({ message: "Нет прав" });
        
        post.text = req.body.text || post.text;
        post.edited = Date.now();
        savePosts();
        
        res.json(post);
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Удалить пост
app.delete("/posts/:id", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        const postIndex = posts.findIndex(p => p.id === req.params.id);
        
        if (postIndex === -1) return res.status(404).json({ message: "Пост не найден" });
        if (posts[postIndex].userId !== decoded.id) return res.status(403).json({ message: "Нет прав" });
        
        posts.splice(postIndex, 1);
        savePosts();
        
        res.json({ success: true });
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Лайк поста
app.post("/posts/:id/like", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        const post = posts.find(p => p.id === req.params.id);
        if (!post) return res.status(404).json({ message: "Пост не найден" });
        
        const likeIndex = post.likes.indexOf(decoded.id);
        if (likeIndex === -1) {
            post.likes.push(decoded.id);
            
            if (post.userId !== decoded.id) {
                const notification = {
                    id: Date.now().toString(),
                    userId: post.userId,
                    type: 'like',
                    fromUserId: decoded.id,
                    fromUserName: users.find(u => u.id === decoded.id)?.name || 'Пользователь',
                    postId: post.id,
                    postText: post.text.substring(0, 50),
                    timestamp: Date.now(),
                    read: false
                };
                notifications.push(notification);
                saveNotifications();
            }
        } else {
            post.likes.splice(likeIndex, 1);
        }
        
        savePosts();
        res.json({ likes: post.likes.length, liked: likeIndex === -1 });
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Комментарий
app.post("/posts/:id/comment", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        const user = users.find(u => u.id === decoded.id);
        const post = posts.find(p => p.id === req.params.id);
        
        if (!post) return res.status(404).json({ message: "Пост не найден" });
        
        const comment = {
            id: Date.now().toString(),
            userId: user.id,
            userName: user.name,
            userAvatar: user.avatar,
            text: req.body.text,
            timestamp: Date.now()
        };
        
        if (!post.comments) post.comments = [];
        post.comments.push(comment);
        savePosts();
        
        if (post.userId !== decoded.id) {
            const notification = {
                id: Date.now().toString(),
                userId: post.userId,
                type: 'comment',
                fromUserId: decoded.id,
                fromUserName: user.name,
                postId: post.id,
                postText: post.text.substring(0, 50),
                commentText: req.body.text.substring(0, 50),
                timestamp: Date.now(),
                read: false
            };
            notifications.push(notification);
            saveNotifications();
        }
        
        res.json(comment);
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Уведомления
app.get("/notifications", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        const userNotifications = notifications
            .filter(n => n.userId === decoded.id)
            .sort((a, b) => b.timestamp - a.timestamp);
        
        res.json(userNotifications);
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

app.post("/notifications/read/:id", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        const notification = notifications.find(n => n.id === req.params.id);
        if (notification && notification.userId === decoded.id) {
            notification.read = true;
            saveNotifications();
        }
        res.json({ success: true });
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

app.post("/notifications/read-all", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        notifications
            .filter(n => n.userId === decoded.id)
            .forEach(n => n.read = true);
        saveNotifications();
        res.json({ success: true });
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Чаты (личные)
app.get("/chats", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        updateLastSeen(decoded.id);
        
        // Личные чаты
        const userChats = chats.filter(c => c.participants && c.participants.includes(decoded.id));
        
        const chatsWithUsers = userChats.map(chat => {
            const otherId = chat.participants.find(id => id !== decoded.id);
            const otherUser = users.find(u => u.id === otherId);
            return {
                ...chat,
                type: 'private',
                otherUser: otherUser ? { 
                    id: otherUser.id, 
                    name: otherUser.name, 
                    avatar: otherUser.avatar,
                    lastSeen: otherUser.lastSeen
                } : null
            };
        });
        
        // Групповые чаты
        const userGroups = groups.filter(g => g.members && g.members.includes(decoded.id));
        
        const groupsWithInfo = userGroups.map(group => {
            return {
                ...group,
                type: 'group'
            };
        });
        
        // Объединяем и сортируем по последнему сообщению
        const all = [...chatsWithUsers, ...groupsWithInfo].sort((a, b) => {
            const aLast = a.messages?.[a.messages.length - 1]?.timestamp || 0;
            const bLast = b.messages?.[b.messages.length - 1]?.timestamp || 0;
            return bLast - aLast;
        });
        
        res.json(all);
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Получить информацию о группе
app.get("/groups/:id", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        const group = groups.find(g => g.id === req.params.id);
        
        if (!group) return res.status(404).json({ message: "Группа не найдена" });
        if (!group.members.includes(decoded.id)) return res.status(403).json({ message: "Нет доступа" });
        
        // Добавляем информацию об участниках
        const membersWithInfo = group.members.map(memberId => {
            const user = users.find(u => u.id === memberId);
            return {
                id: memberId,
                name: user?.name || 'Пользователь',
                avatar: user?.avatar,
                isAdmin: group.admins?.includes(memberId) || false,
                isCreator: group.creator === memberId
            };
        });
        
        res.json({
            ...group,
            membersInfo: membersWithInfo
        });
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Получить сообщения чата/группы
app.get("/chats/:id/messages", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        updateLastSeen(decoded.id);
        
        // Ищем в личных чатах
        let chat = chats.find(c => c.id === req.params.id);
        let type = 'private';
        
        // Если не нашли, ищем в группах
        if (!chat) {
            chat = groups.find(g => g.id === req.params.id);
            type = 'group';
        }
        
        if (!chat) return res.status(404).json({ message: "Чат не найден" });
        
        // Проверяем доступ
        if (type === 'private' && !chat.participants.includes(decoded.id)) {
            return res.status(403).json({ message: "Нет доступа" });
        }
        if (type === 'group' && !chat.members.includes(decoded.id)) {
            return res.status(403).json({ message: "Нет доступа" });
        }
        
        // Добавляем информацию о пользователях к сообщениям
        const messagesWithUsers = (chat.messages || []).map(msg => {
            const user = users.find(u => u.id === msg.userId);
            return {
                ...msg,
                user: user ? {
                    id: user.id,
                    name: user.name,
                    avatar: user.avatar
                } : null
            };
        });
        
        res.json(messagesWithUsers);
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Отправить сообщение в чат/группу
app.post("/chats/:id/messages", upload.single('file'), (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        
        // Ищем в личных чатах
        let chat = chats.find(c => c.id === req.params.id);
        let type = 'private';
        
        // Если не нашли, ищем в группах
        if (!chat) {
            chat = groups.find(g => g.id === req.params.id);
            type = 'group';
        }
        
        if (!chat) return res.status(404).json({ message: "Чат не найден" });
        
        // Проверяем доступ
        if (type === 'private' && !chat.participants.includes(decoded.id)) {
            return res.status(403).json({ message: "Нет доступа" });
        }
        if (type === 'group' && !chat.members.includes(decoded.id)) {
            return res.status(403).json({ message: "Нет доступа" });
        }
        
        const message = {
            id: Date.now().toString(),
            userId: decoded.id,
            text: req.body.text || '',
            timestamp: Date.now()
        };
        
        if (req.file) {
            const fileUrl = `/uploads/${req.file.filename}`;
            const fileType = req.file.mimetype.split('/')[0];
            message.file = {
                url: fileUrl,
                name: req.file.originalname,
                type: fileType,
                mime: req.file.mimetype,
                size: req.file.size,
                filename: req.file.filename
            };
        }
        
        if (!chat.messages) chat.messages = [];
        chat.messages.push(message);
        
        if (type === 'private') {
            saveChats();
        } else {
            saveGroups();
        }
        
        // Добавляем информацию о пользователе
        const user = users.find(u => u.id === decoded.id);
        message.user = {
            id: user.id,
            name: user.name,
            avatar: user.avatar
        };
        
        res.json(message);
    } catch (err) {
        console.error(err);
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Создать личный чат
app.post("/chats/create/:userId", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        const otherUser = users.find(u => u.id === req.params.userId);
        
        if (!otherUser) return res.status(404).json({ message: "Пользователь не найден" });
        
        let chat = chats.find(c => 
            c.participants && 
            c.participants.includes(decoded.id) && 
            c.participants.includes(otherUser.id)
        );
        
        if (!chat) {
            chat = {
                id: Date.now().toString(),
                participants: [decoded.id, otherUser.id],
                messages: [],
                created: Date.now()
            };
            chats.push(chat);
            saveChats();
        }
        
        res.json(chat);
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Создать группу
app.post("/groups/create", upload.single('avatar'), (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        
        const { name, memberIds, allowMembersToAdd } = req.body;
        
        if (!name) return res.status(400).json({ message: "Название группы обязательно" });
        
        // Парсим список участников
        let members = [decoded.id]; // Создатель автоматически в группе
        if (memberIds) {
            try {
                const parsed = JSON.parse(memberIds);
                if (Array.isArray(parsed)) {
                    members = [...members, ...parsed.filter(id => id !== decoded.id)];
                }
            } catch (e) {}
        }
        
        // Убираем дубликаты
        members = [...new Set(members)];
        
        // Генерируем ссылку-приглашение
        const inviteLink = Date.now().toString(36) + Math.random().toString(36).substring(2);
        
        let avatar = '';
        if (req.file) {
            avatar = `/uploads/${req.file.filename}`;
        }
        
        const group = {
            id: Date.now().toString(),
            name,
            avatar,
            creator: decoded.id,
            admins: [decoded.id], // Создатель - админ
            members,
            allowMembersToAdd: allowMembersToAdd === 'true', // Могут ли участники добавлять других
            messages: [],
            inviteLink,
            created: Date.now()
        };
        
        groups.push(group);
        saveGroups();
        
        res.json(group);
    } catch (err) {
        console.error(err);
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Обновить группу
app.put("/groups/:id", upload.single('avatar'), (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        const group = groups.find(g => g.id === req.params.id);
        
        if (!group) return res.status(404).json({ message: "Группа не найдена" });
        if (!group.admins.includes(decoded.id)) return res.status(403).json({ message: "Только админы могут изменять группу" });
        
        const { name, allowMembersToAdd } = req.body;
        
        if (name) group.name = name;
        if (allowMembersToAdd !== undefined) group.allowMembersToAdd = allowMembersToAdd === 'true';
        
        if (req.file) {
            group.avatar = `/uploads/${req.file.filename}`;
        }
        
        saveGroups();
        
        res.json(group);
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Добавить участника в группу
app.post("/groups/:id/members", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        const group = groups.find(g => g.id === req.params.id);
        const { userId } = req.body;
        
        if (!group) return res.status(404).json({ message: "Группа не найдена" });
        
        // Проверяем права
        const canAdd = group.admins.includes(decoded.id) || group.allowMembersToAdd;
        if (!canAdd) return res.status(403).json({ message: "Нет прав на добавление участников" });
        
        if (!group.members.includes(userId)) {
            group.members.push(userId);
            saveGroups();
        }
        
        res.json({ success: true });
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Удалить участника из группы
app.delete("/groups/:id/members/:userId", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        const group = groups.find(g => g.id === req.params.id);
        const userIdToRemove = req.params.userId;
        
        if (!group) return res.status(404).json({ message: "Группа не найдена" });
        
        // Только админы могут удалять участников
        if (!group.admins.includes(decoded.id)) {
            return res.status(403).json({ message: "Только админы могут удалять участников" });
        }
        
        // Нельзя удалить создателя
        if (userIdToRemove === group.creator) {
            return res.status(403).json({ message: "Нельзя удалить создателя группы" });
        }
        
        group.members = group.members.filter(id => id !== userIdToRemove);
        group.admins = group.admins.filter(id => id !== userIdToRemove);
        
        saveGroups();
        
        res.json({ success: true });
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Назначить админа
app.post("/groups/:id/admins", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        const group = groups.find(g => g.id === req.params.id);
        const { userId } = req.body;
        
        if (!group) return res.status(404).json({ message: "Группа не найдена" });
        
        // Только создатель может назначать админов
        if (group.creator !== decoded.id) {
            return res.status(403).json({ message: "Только создатель может назначать админов" });
        }
        
        if (!group.admins.includes(userId) && group.members.includes(userId)) {
            group.admins.push(userId);
            saveGroups();
        }
        
        res.json({ success: true });
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Снять админа
app.delete("/groups/:id/admins/:userId", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        const group = groups.find(g => g.id === req.params.id);
        const userIdToRemove = req.params.userId;
        
        if (!group) return res.status(404).json({ message: "Группа не найдена" });
        
        // Только создатель может снимать админов
        if (group.creator !== decoded.id) {
            return res.status(403).json({ message: "Только создатель может снимать админов" });
        }
        
        // Нельзя снять админа с создателя
        if (userIdToRemove === group.creator) {
            return res.status(403).json({ message: "Нельзя снять админа с создателя" });
        }
        
        group.admins = group.admins.filter(id => id !== userIdToRemove);
        saveGroups();
        
        res.json({ success: true });
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Присоединиться к группе по ссылке
app.post("/groups/join/:link", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        
        const group = groups.find(g => g.inviteLink === req.params.link);
        
        if (!group) return res.status(404).json({ message: "Группа не найдена" });
        
        if (!group.members.includes(decoded.id)) {
            group.members.push(decoded.id);
            saveGroups();
        }
        
        res.json(group);
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Редактировать сообщение
app.put("/chats/:chatId/messages/:messageId", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        
        let chat = chats.find(c => c.id === req.params.chatId);
        let type = 'private';
        
        if (!chat) {
            chat = groups.find(g => g.id === req.params.chatId);
            type = 'group';
        }
        
        if (!chat) return res.status(404).json({ message: "Чат не найден" });
        
        const message = chat.messages?.find(m => m.id === req.params.messageId);
        if (!message) return res.status(404).json({ message: "Сообщение не найдено" });
        
        if (message.userId !== decoded.id) {
            return res.status(403).json({ message: "Можно редактировать только свои сообщения" });
        }
        
        message.text = req.body.text;
        message.edited = Date.now();
        
        if (type === 'private') {
            saveChats();
        } else {
            saveGroups();
        }
        
        res.json(message);
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Удалить сообщение
app.delete("/chats/:chatId/messages/:messageId", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const decoded = jwt.verify(token, SECRET);
        
        let chat = chats.find(c => c.id === req.params.chatId);
        let type = 'private';
        
        if (!chat) {
            chat = groups.find(g => g.id === req.params.chatId);
            type = 'group';
        }
        
        if (!chat) return res.status(404).json({ message: "Чат не найден" });
        
        const messageIndex = chat.messages?.findIndex(m => m.id === req.params.messageId);
        if (messageIndex === -1) return res.status(404).json({ message: "Сообщение не найдено" });
        
        const message = chat.messages[messageIndex];
        
        // В группе могут удалять сообщения все участники
        if (type === 'group') {
            if (!chat.members.includes(decoded.id)) {
                return res.status(403).json({ message: "Нет прав" });
            }
        } else {
            if (message.userId !== decoded.id && !chat.participants.includes(decoded.id)) {
                return res.status(403).json({ message: "Нет прав" });
            }
        }
        
        if (message.file) {
            message.text = "[Файл удалён]";
            message.file = null;
            message.deleted = true;
        } else {
            chat.messages.splice(messageIndex, 1);
        }
        
        if (type === 'private') {
            saveChats();
        } else {
            saveGroups();
        }
        
        res.json({ success: true });
    } catch {
        res.status(401).json({ message: "Неверный токен" });
    }
});

// Поиск пользователей
app.get("/users/search/:query", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const query = req.params.query.toLowerCase();
        const results = users
            .filter(u => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query))
            .map(u => ({ id: u.id, name: u.name, email: u.email, avatar: u.avatar, lastSeen: u.lastSeen }));
        
        res.json(results);
    } catch {
        res.status(401).json({ message: "Ошибка поиска" });
    }
});

// Информация о файлах на сервере
app.get("/storage/info", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Нет токена" });

    try {
        const uploadsDir = path.join(__dirname, 'uploads');
        let uploadsSize = 0;
        let uploadsCount = 0;
        
        if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            uploadsCount = files.length;
            files.forEach(file => {
                const filePath = path.join(uploadsDir, file);
                try {
                    const stats = fs.statSync(filePath);
                    uploadsSize += stats.size;
                } catch (e) {}
            });
        }
        
        res.json({
            uploadsCount,
            uploadsSize,
            usersCount: users.length,
            postsCount: posts.length,
            chatsCount: chats.length,
            groupsCount: groups.length,
            notificationsCount: notifications.length
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Ошибка получения информации" });
    }
});

// Создаём папки
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

app.listen(3000, "0.0.0.0", () => {
    console.log("🚀 BMessage запущен на http://localhost:3000");
    console.log("📁 Файлы сохраняются на сервере в папке uploads/");
});
