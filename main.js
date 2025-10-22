const express = require('express');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();

// Rate limiting configuration
const limiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 2000,
    message: '❌ Too many requests. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const hourlyLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 90,
    message: '❌ Too many requests. Please try again later.',
});

// Secret keys
const V2_SECRET = '6LeIjfMrAAAAACHYrIiLit-YcHU84mAsVgw6ivD-';
const V3_SECRET = '6LeVjfMrAAAAAKWUuhsebDkx_KowYHC135wvupTp';
const REDIRECT_URL = 'https://rekonise.com/best-script-for-nft-battle-and-others-t1ddm';

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('.'));

function verifyBrowserFingerprint(req) {
    const userAgent = req.headers['user-agent'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    
    if (!userAgent) {
        console.log('❌ Missing User-Agent');
        return false;
    }
    
    const botIndicators = [
        'bot', 'crawler', 'spider', 'scraper', 'monitor', 'checker',
        'python', 'requests', 'curl', 'wget', 'java', 'php', 'go-http'
    ];
    
    const userAgentLower = userAgent.toLowerCase();
    if (botIndicators.some(indicator => userAgentLower.includes(indicator))) {
        console.log('❌ Bot detected:', userAgent);
        return false;
    }
    
    if (!acceptLanguage) {
        console.log('❌ Missing Accept-Language');
        return false;
    }
    
    console.log('✅ Browser verification passed');
    return true;
}

function validateRecaptchaResponse(responseToken) {
    if (!responseToken) {
        console.log('❌ No token provided');
        return false;
    }
    
    if (responseToken.length < 20 || responseToken.length > 2000) {
        console.log('❌ Invalid token length:', responseToken.length);
        return false;
    }
    
    const validTokenRegex = /^[a-zA-Z0-9_-]+$/;
    if (!validTokenRegex.test(responseToken)) {
        console.log('❌ Invalid token format');
        return false;
    }
    
    return true;
}

async function verifyRecaptchaV2(responseToken) {
    const v2VerifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
    const v2Payload = new URLSearchParams({
        secret: V2_SECRET,
        response: responseToken
    });
    
    try {
        const response = await axios.post(v2VerifyUrl, v2Payload.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 10000
        });
        console.log('v2 Verification result:', response.data);
        return response.data;
    } catch (error) {
        console.error('reCAPTCHA v2 verification error:', error.message);
        return { success: false };
    }
}

async function verifyRecaptchaV3(responseToken) {
    const v3VerifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
    const v3Payload = new URLSearchParams({
        secret: V3_SECRET,
        response: responseToken
    });
    
    try {
        const response = await axios.post(v3VerifyUrl, v3Payload.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 10000
        });
        console.log('v3 Verification result:', response.data);
        return response.data;
    } catch (error) {
        console.error('reCAPTCHA v3 verification error:', error.message);
        return { success: false, score: 0.0 };
    }
}

function renderHTML(error = null) {
    try {
        let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
        
        if (error) {
            html = html.replace('<!--ERROR-->', `<div class="error">${error}</div>`);
        } else {
            html = html.replace('<!--ERROR-->', '');
        }
        
        return html;
    } catch (error) {
        console.error('Error reading HTML file:', error);
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Security Verification</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: #000; color: white; }
                .error { color: red; margin: 20px 0; padding: 10px; border: 1px solid red; background: rgba(255,0,0,0.1); }
                .container { max-width: 400px; margin: 0 auto; background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Security Verification</h1>
                ${error ? `<div class="error">${error}</div>` : ''}
                <form method="POST">
                    <div class="g-recaptcha" data-sitekey="6LeIjfMrAAAAAGZvtV4NssePlRtOYbZz0TlU_QMH"></div>
                    <br/>
                    <button type="submit" style="padding: 10px 20px; background: #9d4edd; color: white; border: none; border-radius: 5px; cursor: pointer;">Verify</button>
                </form>
            </div>
            <script src="https://www.google.com/recaptcha/api.js" async defer></script>
        </body>
        </html>`;
    }
}

// Routes
app.get('/', limiter, (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(renderHTML());
});

app.post('/', hourlyLimiter, async (req, res) => {
    try {
        console.log('Received POST data:', req.body);

        // Browser verification
        if (!verifyBrowserFingerprint(req)) {
            return res.status(403).send(renderHTML('❌ Suspicious activity detected.'));
        }

        // Get form responses
        const v2Response = req.body['g-recaptcha-response'];
        const v3Response = req.body['recaptcha_v3_token'];

        console.log('Captcha responses:', {
            v2: v2Response ? 'present' : 'missing',
            v3: v3Response ? 'present' : 'missing'
        });

        // Validate v2 response
        if (!v2Response || !validateRecaptchaResponse(v2Response)) {
            console.log('❌ Invalid v2 captcha format');
            return res.send(renderHTML('❌ Please complete the captcha verification.'));
        }

        // Verify both captchas in parallel
        const [v2Result, v3Result] = await Promise.all([
            verifyRecaptchaV2(v2Response),
            verifyRecaptchaV3(v3Response)
        ]);

        // v3 assessment (score >= 0.5 is considered human)
        const v3Pass = v3Result.success && v3Result.score >= 0.5;

        console.log('Final verification:', {
            v2Success: v2Result.success,
            v3Success: v3Result.success,
            v3Score: v3Result.score,
            v3Pass: v3Pass
        });

        if (v2Result.success && v3Pass) {
            // SUCCESS - redirect
            console.log(`✅ Captcha passed! Redirecting to: ${REDIRECT_URL}`);
            return res.redirect(302, REDIRECT_URL);
        } else {
            let errorMsg = '❌ Captcha verification failed. ';
            if (!v2Result.success) {
                errorMsg += 'Please complete the captcha. ';
            }
            if (!v3Pass) {
                errorMsg += `Low trust score: ${v3Result.score ? v3Result.score.toFixed(2) : '0.00'}.`;
            }
            return res.send(renderHTML(errorMsg.trim()));
        }
    } catch (error) {
        console.error('Request processing error:', error);
        return res.status(500).send(renderHTML('❌ Internal server error.'));
    }
});

app.get('/style.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'style.css'));
});

// Error handlers
app.use((err, req, res, next) => {
    if (err.status === 429) {
        return res.status(429).send(renderHTML('❌ Too many requests. Please try again later.'));
    }
    next(err);
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
