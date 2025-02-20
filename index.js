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
var arquivo = main.logName

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
        writeLog(arquivo, `pasta holerites resetada!`)
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
            writeLog(arquivo, `${totalFiles.length} Holerite unificado encontrado!`)
            return [true, totalFiles.length]
        } else if (fs.existsSync(holeritesPath) && totalFiles.length > 1) {
            writeLog(arquivo, `${totalFiles.length} Holerites separados encontrados!`)
            return [true, totalFiles.length]
        } else {
            writeLog(arquivo, `Nenhum holerite encontrado - Total: ${totalFiles.length}!`)
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
                writeLog(arquivo, `${files.length} TXT encontrado!`);
                return [true, files];
            } else {
                writeLog(arquivo, `Nenhum arquivo TXT ou CSV encontrado!`);
                console.log("Nenhum arquivo TXT ou CSV encontrado!");
                return [false, []];
            }
        } else if (txtFiles.length > 1) {
            writeLog(arquivo, `Múltiplos arquivos TXT encontrados!`);
            console.log("Múltiplos arquivos TXT encontrados!");
            return [false, []];
        } else {
            writeLog(arquivo, `Nenhum arquivo TXT encontrado!`);
            console.log("Nenhum arquivo TXT encontrado!");
            return [false, []];
        }
    } catch (error) {
        console.log("Não foi possível obter o arquivo TXT!", error);
        writeLog(arquivo, `Erro ao obter o arquivo TXT!`);
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
    let anexo = [2].includes(opcao);
    let index = 1;
    const fileData = parseToJson(filePath);

    // Validação inicial de fileData
    if (!Array.isArray(fileData) || fileData.length === 0) {
        console.error("O arquivo fornecido está vazio ou inválido.");
        return;
    }

    for (var item of fileData) {
        const start = performance.now();
        const [dd, mm, yyyy] = item["DtRef"].split("/")
        const DESCRICAO_ITEM = `${mm}-${yyyy.substr(2)}-${item["Matricula"]}-${item["Roteiro"]}`
        try {
            let leituraItem;
            switch (opcao) {
                case 1:
                case 2:
                    leituraItem = await incluirDocLiquidacao(item, DESCRICAO_ITEM, index, page, anexo, holeritesPath, fileData.length);
                    break;
                case 3:
                    leituraItem = await pagamentoOBTV(item, DESCRICAO_ITEM, index, page, fileData.length);
                    break;
                default:
                    console.error("Opção inválida:", opcao);
                    await main.closeBrowser();
                    return;
            }

            const end = performance.now();
            const tempoTotal = Math.round((end - start) / 1000);

            if (leituraItem) {
                var texto = [1, 2].includes(opcao) ? "documento incluido com sucesso!" : "pagamento OBTV realizado!"
                writeLog(arquivo, `${index}/${fileData.length} - ${DESCRICAO_ITEM}: ${texto} Tempo total: ${tempoTotal} seg`);
                console.log(`${DESCRICAO_ITEM}: ${texto} Tempo total: ${tempoTotal} seg`)
            }
            if (index === fileData.length - 1) {
                console.log("Leitura finalizada!");
                writeLog(arquivo, `Leitura finalizada!`);
                await main.closeBrowser();
            }
            index++;
        } catch (error) {
            console.error("Erro durante a execução:", error);
            writeLog(arquivo, `Erro na leitura do arquivo TXT: ${error.message}`);
        }
    }
};

const startDebug = async () => {
    try {
        const browserOk = await main.startDebug()

        if (browserOk.status) {
            browser = browserOk.browser
            page = browserOk.page
            return true
        } else {
            writeLog(arquivo, `Erro ao efetuar tentativa de login!`)
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

        if ((opcoesComAnexo && txtExist) || (!opcoesComAnexo && txtExist)) {
            const filePath = path.join(txtPath, files[0])
            opcoesComAnexo && totalHolerites == 1 ? await separarHolerites() : false
            if (await startDebug()) {
                if (await main.acessarHome()) {
                    writeLog(arquivo, `Leitura iniciada!`)
                    console.log(`Leitura iniciada na opção: ${opcao}!`)
                    await automacaoViaArquivo(filePath, opcao)
                }
            }
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
        if (opcao != 0) {
            await iniciarManual(opcao)
        }
        rl.close()
    })
}

start()