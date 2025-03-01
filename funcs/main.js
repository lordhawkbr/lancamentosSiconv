const puppeteer = require("puppeteer");
const delay = require("delay");
const { execSync, spawn } = require("child_process");
const writeLog = require("./writeLog");
let browser, page
var logName = `geral_${new Date().toISOString()}`

process.on("SIGINT", async () => {
    console.log("\nInterrompido pelo usuário (Ctrl+C).");
    await closeBrowser();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    console.log("\nProcesso terminado.");
    await closeBrowser();
    process.exit(0);
});

const closeBrowser = async () => {
    if (page) await page.close();
    if (browser) await browser.close();
    process.exit(0);
};

const startDebug = async () => {
    let status = false;

    try {
        const chromeProcess = spawn(
            '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"',
            [
                "--remote-debugging-port=9202",
                `--user-data-dir="C:\\Temp\\ChromeUserData"`
            ],
            { shell: true }
        );

        chromeProcess.on("error", (err) => {
            throw new Error(`Erro ao iniciar o Chrome: ${err.message}`);
        });

        chromeProcess.on("close", (code) => {
            if (code !== 0) {
                throw new Error(`Chrome foi fechado com código ${code}`);
            }
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        browser = await puppeteer.connect({
            headless: true,
            browserURL: "http://127.0.0.1:9202",
            ignoreHTTPSErrors: true,
            args: [
                "--ignore-certificate-errors",
                "--use-fake-ui-for-media-stream",
                "--disable-geolocation",
                "--no-sandbox",
                "--disable-setuid-sandbox"
            ],
            defaultViewport: null
        });

        context = await browser.createIncognitoBrowserContext();
        const pages = await browser.pages();
        page = pages[0];
        await page.setDefaultNavigationTimeout(process.env.TIMEOUT);
        await page.setDefaultTimeout(process.env.TIMEOUT);
        await page.setJavaScriptEnabled(true)
        status = true;
    } catch (error) {
        console.error("Erro ao iniciar o navegador ou conectar ao Puppeteer:", error.message);
        await closeBrowser();
        writeLog(logName, `Não foi possível iniciar o navegador!`);
        status = false;
    }

    return { status, browser, page };
};

const acessarHome = async () => {
    try {
        var status = false
        await page.goto("https://idp.plataformamaisbrasil.gov.br", { waitUntil: "networkidle2" });
        await page.waitForSelector("#form_submit_login", { visible: true })
        await page.click("#form_submit_login")

        // await delay(10000)
        // if (await page.waitForSelector("#login-certificate", { visible: true })) {
        //     await page.waitForSelector("#login-certificate", { visible: true })
        //     await page.click("#login-certificate")
        //     if (await page.waitForSelector("#header #logo", { visible: true })) {
        status = true
        //     } else {
        //         status = false
        //     }
        // } else {
        //     await page.waitForSelector("#accountId", { visible: true })
        //     await page.type("#accountId", process.env.USER, { delay: 100 })
        //     await page.keyboard.press("Enter")
        //     await page.waitForNavigation()
        //     await page.type("#password", process.env.PASSWORD)
        //     await page.keyboard.press("Enter")
        //     await page.waitForNavigation()
        //     status = true
        // }
    } catch (error) {
        writeLog(logName, `Não foi possível efetuar o login!`);
        console.log("Não foi possível efetuar o login!", error)
        status = false
        await closeBrowser()
    }
    return status
}

module.exports = {
    browser,
    page,
    closeBrowser,
    startDebug,
    acessarHome,
    logName
}