const fs = require("fs");
const path = require("path");

const writeLog = async (arquivo, texto) => {
    try {
        arquivo = arquivo.replace(":","_")
        if (!texto.includes("Session closed") && !texto.includes("Target closed")) {
            var filePath = path.join(`./log`, `${arquivo}.txt`)
            var appendOptions = {};
            if (fs.existsSync(filePath)) {
                appendOptions = { flag: "a" };
            }
            fs.mkdir(`./log`, { recursive: true }, (err) => {
                if (err) {
                    console.log("Erro ao criar a pasta de logs!", err)
                    return;
                }
                var textValue = `\r\n${new Date().toLocaleString()} = ${texto}`

                fs.writeFile(filePath, textValue, appendOptions, (err) => {
                    if (err) {
                        console.log("Erro ao escrever no arquivo:", err)
                        return;
                    }
                })
            })
        }
    } catch (error) {
        console.log("Erro ao criar arquivo de log!", error)
    }
}

module.exports = writeLog