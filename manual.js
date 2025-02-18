const lineReader = require("line-reader")
const fs = require("fs")
const Papa = require("papaparse");
const path = require("path")
const readline = require("readline")
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const writeLog = require("./funcs/writeLog")
require("dotenv/config")
const { incluirDocLiquidacao, pagamentoOBTV } = require("./funcs/automacao")
const main = require("./funcs/main")
const { spawn } = require("child_process");
const { performance } = require("perf_hooks");

let browser, page

const holeritesPath = path.join(__dirname, "arquivos", "holerites")
const txtPath = path.join(__dirname, "arquivos", "txt")

process.on("SIGINT", async () => {
    console.log("\nInterrompido pelo usuário (Ctrl+C).")
    await main.closeBrowser()
    process.exit(0)
})

process.on("SIGTERM", async () => {
    console.log("\nProcesso terminado.")
    await main.closeBrowser()
    process.exit(0)
})

const resetFolder = async () => {
    try {
        for (const path of [holeritesPath, txtPath]) {
            fs.existsSync(path) ? fs.rmSync(path, { recursive: true, force: true }) : false
            fs.mkdirSync(path, { recursive: true })
        }
        writeLog("log", "geral", "txt", `pasta holerites resetada!`)
        return true
    } catch (error) {
        console.log("resetFolder: ", error)
        return false
    }
}

const verifyHoleritesExist = async () => {
    try {
        const totalFiles = fs.readdirSync(holeritesPath)
        if (fs.existsSync(holeritesPath) && totalFiles.length == 1) {
            writeLog("log", "geral", "txt", `${totalFiles.length} Holerite unificado encontrado!`)
            return [true, totalFiles.length]
        } else if (fs.existsSync(holeritesPath) && totalFiles.length > 1) {
            writeLog("log", "geral", "txt", `${totalFiles.length} Holerites separados encontrados!`)
            return [true, totalFiles.length]
        } else {
            writeLog("log", "geral", "txt", `Nenhum holerite encontrado - Total: ${totalFiles.length}!`)
            console.log(`Nenhum holerite encontrado - Total: ${totalFiles.length}!`)
            return [false, false]
        }
    } catch (error) {
        console.log("Não foi possivel obter os arquivos holerites!")
        return false
    }
}

const verifyTxtExist = async () => {
    try {
        const txtFiles = fs.readdirSync(txtPath);
        if (txtFiles.length === 1) {
            const files = txtFiles.filter(file => [".txt", ".csv"].includes(path.extname(file).toLowerCase()));

            if (files.length > 0) {
                writeLog("log", "geral", "txt", `${files.length} TXT encontrado!`);
                return [true, files];
            } else {
                writeLog("log", "geral", "txt", `Nenhum arquivo TXT ou CSV encontrado!`);
                console.log("Nenhum arquivo TXT ou CSV encontrado!");
                return [false, []];
            }
        } else if (txtFiles.length > 1) {
            writeLog("log", "geral", "txt", `Múltiplos arquivos TXT encontrados!`);
            console.log("Múltiplos arquivos TXT encontrados!");
            return [false, []];
        } else {
            writeLog("log", "geral", "txt", `Nenhum arquivo TXT encontrado!`);
            console.log("Nenhum arquivo TXT encontrado!");
            return [false, []];
        }
    } catch (error) {
        console.log("Não foi possível obter o arquivo TXT!", error);
        writeLog("log", "geral", "txt", `Erro ao obter o arquivo TXT!`);
        return [false, []];
    }
};

const parseToJson = (csvFilePath) => {
    const csvData = fs.readFileSync(csvFilePath, "utf8");
    const parsedData = Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
    });
    const jsonObj = parsedData.data;
    const groupedData = [];
    jsonObj.forEach((item) => {
        const { Matricula, 'Tipo Verba': tipoVerba } = item;
        let matriculaGroup = groupedData.find(group => group.Matricula === Matricula);
        if (!matriculaGroup) {
            matriculaGroup = {
                Matricula: Matricula,
                ADMINISTRATIVO: item["ADMINISTRATIVO"],
                CONVENIO: item["CONVENIO"],
                DtPag: item["Dt Pag."],
                DtRef: item["Dt. Ref."],
                Roteiro: item["Roteiro"],
                CPF: item["CPF"].replaceAll(".", "").replaceAll("-", ""),
                BANCO: item["BANCO"],
                AGENCIA: item["AGENCIA"],
                CONTA: item["CONTA"],
                DIGITO: item["DIGITO"],
                TiposVerba: {}
            };
            groupedData.push(matriculaGroup);
        }
        if (!matriculaGroup.TiposVerba[tipoVerba]) {
            matriculaGroup.TiposVerba[tipoVerba] = [];
        }
        matriculaGroup.TiposVerba[tipoVerba].push(item);
    });

    return groupedData;
};

const automacaoViaArquivo = async (filePath, opcao) => {
    let anexo = [2].includes(opcao)
    let index = 0
    const fileData = parseToJson(filePath)
    for (var item of fileData) {
        const start = performance.now();
        try {
            let leituraItem
            switch (opcao) {
                case 1:
                case 2:
                    leituraItem = await incluirDocLiquidacao(item, index, page, anexo, holeritesPath)
                    break;
                case 9:
                    leituraItem = await pagamentoOBTV(item, index, page)
                    break;
                default:
                    break;
            }
            const end = performance.now();
            const tempoTotal = Math.round((end - start) / 1000)
            if (leituraItem) {
                console.log(`CPF ${item["CPF"]} executado com sucesso! - Tempo total: ${tempoTotal} seg`)
                writeLog("log", "geral", "txt", `CPF ${item["CPF"]} executado com sucesso! - Tempo total: ${tempoTotal} seg`)
                item = []
                // cb()
            } else {
                console.log(`Erro na leitura do CPF ${item["CPF"]}`)
                writeLog("log", "geral", "txt", `Erro na leitura do CPF ${item["CPF"]}`)
                item = []
                // cb()
            }
            if (index === fileData.length - 1) {
                console.log("Leitura finalizada!")
                writeLog("log", "geral", "txt", `Leitura finalizada!`)
                await main.closeBrowser()
                // resolve()
            }
            index++;
        } catch (error) {
            console.log(error)
            console.log(`Erro na leitura do arquivo TXT!`)
            writeLog("log", "geral", "txt", `Erro na leitura do arquivo TXT!`)
            await main.closeBrowser()
            reject(error)
        }
    }
}

const startDebug = async () => {
    try {
        const browserOk = await main.startDebug()

        if (browserOk.status) {
            browser = browserOk.browser
            page = browserOk.page
            return true
        } else {
            writeLog("log", "geral", "txt", `Erro ao efetuar tentativa de login!`)
            console.log("Erro ao efetuar tentativa de login!")
            await main.closeBrowser()
            return false
        }
    } catch (error) {
        console.log(`startDebug: ${error} `)
        return false
    }
}

const iniciarManual = async (opcao) => {
    try {
        const [holeritesExist, totalHolerites] = await verifyHoleritesExist();
        const [txtExist, files] = await verifyTxtExist();
        const opcoesComAnexo = [2].includes(opcao)

        if ((opcoesComAnexo && holeritesExist && txtExist) ||
            (!opcoesComAnexo && txtExist)) {
            const filePath = path.join(txtPath, files[0])
            opcoesComAnexo && totalHolerites == 1 ? await separarHolerites() : false
            if (await startDebug()) {
                if (await main.acessarHome()) {
                    writeLog("log", "geral", "txt", `Leitura iniciada!`)
                    console.log(`Leitura iniciada na opção: ${opcao}!`)
                    await automacaoViaArquivo(filePath, opcao)
                }
            } else {
                console.log("Cancelado")
            }
        } else {
            console.log("Cancelado")
        }
    } catch (error) {
        console.log("Erro ao ler o diretório: ", error)
        await main.closeBrowser()
        return
    }
}

const start = async () => {
    console.log("> 1) Incluir documento de liquidação (SEM ANEXO);")
    console.log("> 2) Incluir documento de liquidação (COM ANEXO);")
    console.log("> 3) Realizar pagamento OBTV;")
    console.log("> 0) Cancelar")

    rl.question("Digite a opção p/ iniciar: ", async (op) => {
        let opcao = parseInt(op)
        await iniciarManual(opcao)
        rl.close()
    })
}

start()