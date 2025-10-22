const express = require('express');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();

// Rate limiting
const limiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 2000,
    message: '❌ Too many requests. Please try again later.',
});

const hourlyLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
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

// Убрал сложные проверки браузера которые блокировали форму
async function verifyRecaptchaV2(responseToken) {
    try {
        const response = await axios.post('https://www.google.com/recaptcha/api/siteverify', 
            `secret=${V2_SECRET}&response=${responseToken}`,
            { 
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 5000
            }
        );
        console.log('v2 Result:', response.data);
        return response.data;
    } catch (error) {
        console.error('reCAPTCHA v2 error:', error.message);
        return { success: false };
    }
}

async function verifyRecaptchaV3(responseToken) {
    if (!responseToken) {
        console.log('v3 token missing');
        return { success: false, score: 0.0 };
    }
    
    try {
        const response = await axios.post('https://www.google.com/recaptcha/api/siteverify',
            `secret=${V3_SECRET}&response=${responseToken}`,
            { 
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 5000
            }
        );
        console.log('v3 Result:', response.data);
        return response.data;
    } catch (error) {
        console.error('reCAPTCHA v3 error:', error.message);
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
        // Fallback simple HTML
        return `<!DOCTYPE html>
        <html>
        <body style="background:black;color:white;text-align:center;padding:50px">
            <h1>Security Check</h1>
            ${error ? `<div style="color:red;margin:20px">${error}</div>` : ''}
            <form method="POST">
                <div class="g-recaptcha" data-sitekey="6LeIjfMrAAAAAGZvtV4NssePlRtOYbZz0TlU_QMH"></div>
                <button type="submit" style="padding:10px 20px;margin:10px">Verify</button>
            </form>
            <script src="https://www.google.com/recaptcha/api.js" async defer></script>
        </body>
        </html>`;
    }
}

// Routes
app.get('/', limiter, (req, res) => {
    res.send(renderHTML());
});

app.post('/', hourlyLimiter, async (req, res) => {
    try {
        console.log('=== FORM SUBMISSION START ===');
        console.log('Request body keys:', Object.keys(req.body));
        console.log('v2 response present:', !!req.body['g-recaptcha-response']);
        console.log('v3 token present:', !!req.body['recaptcha_v3_token']);

        const v2Response = req.body['g-recaptcha-response'];
        const v3Response = req.body['recaptcha_v3_token'];

        // Основная проверка - только v2 капча
        if (!v2Response) {
            console.log('❌ No v2 captcha response');
            return res.send(renderHTML('❌ Please complete the captcha verification.'));
        }

        // Проверяем обе капчи
        const [v2Result, v3Result] = await Promise.all([
            verifyRecaptchaV2(v2Response),
            verifyRecaptchaV3(v3Response)
        ]);

        console.log('Final results - v2:', v2Result.success, 'v3:', v3Result.success, 'score:', v3Result.score);

        // УСПЕХ: если v2 пройдена И (v3 пройдена ИЛИ v3 не работает но v2 ок)
        if (v2Result.success && (v3Result.success || !v3Response)) {
            console.log('✅ SUCCESS! Redirecting to:', REDIRECT_URL);
            return res.redirect(302, REDIRECT_URL);
        } else {
            // Если v3 не работает, но v2 ок - все равно пропускаем
            if (v2Result.success && !v3Response) {
                console.log('✅ v2 success, v3 missing - ALLOWING');
                return res.redirect(302, REDIRECT_URL);
            }
            
            let errorMsg = '❌ Verification failed. ';
            if (!v2Result.success) errorMsg += 'Invalid captcha. ';
            if (v3Result.score < 0.5) errorMsg += 'Low trust score.';
            
            console.log('❌ FAILED:', errorMsg);
            return res.send(renderHTML(errorMsg));
        }

    } catch (error) {
        console.error('❌ SERVER ERROR:', error);
        return res.send(renderHTML('❌ Server error. Please try again.'));
    }
});

app.get('/style.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'style.css'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
