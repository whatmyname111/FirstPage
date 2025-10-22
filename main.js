const express = require('express');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();

// Конфигурация rate limiting
const limiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 часа
    max: 2000, // максимум 2000 запросов в день
    message: '❌ Слишком много запросов. Попробуйте позже.',
    standardHeaders: true,
    legacyHeaders: false,
});

const hourlyLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 90, // максимум 90 запросов в час
    message: '❌ Слишком много запросов. Попробуйте позже.',
});

// Секретные ключи
const V2_SECRET = '6LeIjfMrAAAAACHYrIiLit-YcHU84mAsVgw6ivD-';
const V3_SECRET = '6LeVjfMrAAAAAKWUuhsebDkx_KowYHC135wvupTp';
const REDIRECT_URL = 'https://rekonise.com/best-script-for-nft-battle-and-others-t1ddm';

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('.'));

function verifyBrowserFingerprint(req) {
    /** Упрощенная проверка браузера */
    const userAgent = req.headers['user-agent'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    const referer = req.headers['referer'] || '';
    
    // Проверка User-Agent
    if (!userAgent) {
        console.log('❌ Отсутствует User-Agent');
        return false;
    }
    
    // Проверка на ботов
    const botIndicators = [
        'bot', 'crawler', 'spider', 'scraper', 'monitor', 'checker',
        'python', 'requests', 'curl', 'wget', 'java', 'php', 'go-http'
    ];
    
    const userAgentLower = userAgent.toLowerCase();
    if (botIndicators.some(indicator => userAgentLower.includes(indicator))) {
        console.log('❌ Обнаружен бот:', userAgent);
        return false;
    }
    
    // Проверка языка (должен быть установлен)
    if (!acceptLanguage) {
        console.log('❌ Отсутствует Accept-Language');
        return false;
    }
    
    // Проверка referrer (опционально, но желательно)
    if (!referer) {
        console.log('⚠️ Отсутствует Referer');
        // Не блокируем, но логируем
    }
    
    console.log('✅ Проверка браузера пройдена');
    return true;
}

function validateRecaptchaResponse(responseToken) {
    /** Валидация токена reCAPTCHA */
    if (!responseToken) {
        return false;
    }
        
    if (responseToken.length < 20 || responseToken.length > 1000) {
        return false;
    }
    
    // Проверка формата токена
    const validTokenRegex = /^[a-zA-Z0-9_-]+$/;
    if (!validTokenRegex.test(responseToken)) {
        return false;
    }
        
    return true;
}

async function verifyRecaptchaV2(responseToken) {
    /** Проверка reCAPTCHA v2 */
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
        return response.data;
    } catch (error) {
        console.error('Ошибка проверки reCAPTCHA v2:', error.message);
        return { success: false };
    }
}

async function verifyRecaptchaV3(responseToken) {
    /** Проверка reCAPTCHA v3 */
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
        return response.data;
    } catch (error) {
        console.error('Ошибка проверки reCAPTCHA v3:', error.message);
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
        console.error('Ошибка чтения HTML файла:', error);
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
                    <button type="submit" style="padding: 10px 20px; background: #9d4edd; color: white; border: none; border-radius: 5px; cursor: pointer;">Подтвердить</button>
                </form>
            </div>
            <script src="https://www.google.com/recaptcha/api.js" async defer></script>
        </body>
        </html>`;
    }
}

// Маршруты
app.get('/', limiter, (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(renderHTML());
});

app.post('/', hourlyLimiter, async (req, res) => {
    try {
        // Проверка браузера
        if (!verifyBrowserFingerprint(req)) {
            console.log('❌ Обнаружена подозрительная активность');
            return res.status(403).send(renderHTML('❌ Обнаружена подозрительная активность.'));
        }

        // Получаем ответы с формы
        const v2Response = req.body['g-recaptcha-response'];
        const v3Response = req.body['g-recaptcha-v3-response'];

        // Валидация входных данных
        if (!v2Response || !validateRecaptchaResponse(v2Response)) {
            console.log('❌ Неверный формат капчи');
            return res.send(renderHTML('❌ Неверный формат капчи!'));
        }

        // Проверка v2 и v3 параллельно
        const [v2Result, v3Result] = await Promise.all([
            verifyRecaptchaV2(v2Response),
            verifyRecaptchaV3(v3Response)
        ]);

        // Оценка v3 (score >= 0.5 считается человеком)
        const v3Pass = v3Result.success && v3Result.score >= 0.5;

        console.log('Результаты проверки:', {
            v2Success: v2Result.success,
            v3Success: v3Result.success,
            v3Score: v3Result.score,
            v3Pass: v3Pass
        });

        if (v2Result.success && v3Pass) {
            // УСПЕШНО - редирект на внешний URL
            console.log(`✅ Капча пройдена! Редирект на: ${REDIRECT_URL}`);
            return res.redirect(302, REDIRECT_URL);
        } else {
            let errorMsg = '❌ Капча не пройдена. ';
            if (!v2Result.success) {
                errorMsg += 'Ошибка проверки v2. ';
                console.log('Ошибка reCAPTCHA v2:', v2Result['error-codes']);
            }
            if (!v3Pass) {
                errorMsg += `Низкий рейтинг доверия: ${v3Result.score ? v3Result.score.toFixed(2) : '0.00'}.`;
                console.log('Ошибка reCAPTCHA v3:', v3Result['error-codes']);
            }
            return res.send(renderHTML(errorMsg.trim()));
        }
    } catch (error) {
        console.error('Ошибка обработки запроса:', error);
        return res.status(500).send(renderHTML('❌ Внутренняя ошибка сервера.'));
    }
});

app.get('/style.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'style.css'));
});

// Обработчик ошибки rate limit
app.use((err, req, res, next) => {
    if (err.status === 429) {
        return res.status(429).send(renderHTML('❌ Слишком много запросов. Попробуйте позже.'));
    }
    next(err);
});

// Запуск сервера
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
