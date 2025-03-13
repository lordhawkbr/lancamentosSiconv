const puppeteer = require("puppeteer");
const delay = require("delay");
const { execSync, spawn } = require("child_process");

let browser, page
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
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-renderer-backgrounding"
            ],
            defaultViewport: null
        });

        context = await browser.createIncognitoBrowserContext();
        const pages = await browser.pages();
        page = pages[0];
        await page.setDefaultNavigationTimeout(process.env.TIMEOUT);
        await page.setDefaultTimeout(process.env.TIMEOUT);
        await page.setJavaScriptEnabled(true)
        await page.bringToFront()
        status = true;
    } catch (error) {
        console.error("Erro ao iniciar o navegador ou conectar ao Puppeteer:", error.message);
        await closeBrowser();
    
        
        status = false;
    }

    return { status, browser, page };
};

const clicarEAguardar = async (page, wait, seletor) => {
    await page.waitForSelector(seletor, { visible: true });
    await Promise.all([
        page.click(seletor),
        wait ? page.waitForNavigation({ waitUntil: "networkidle2" }) : true
    ]);
}

const preencherCampo = async (page, type, seletor, valor, timeout) => {
    await page.waitForSelector(seletor, { visible: true });
    await page.click(seletor);
    type == "type" ? await page.type(seletor, valor, { delay: 1 }) : await page.select(seletor, valor)
    timeout ? await page.waitForTimeout(1000) : true
}

const acessarHome = async () => {
    try {
        var status = false
        await page.goto("https://idp.plataformamaisbrasil.gov.br", { waitUntil: "networkidle2" });

        await clicarEAguardar(page, "true", "#form_submit_login")
        // await preencherCampo(page, "type", "#accountId", process.env.login, false)
        // await clicarEAguardar(page, "true", "#enter-account-id")
        // await preencherCampo(page, "type", "#password", process.env.password, false)

        await page.waitForFunction(
            () => window.location.href.includes("Principal.do"), { timeout: 120000 }
        );
        status = true;
    } catch (error) {
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
    acessarHome
}