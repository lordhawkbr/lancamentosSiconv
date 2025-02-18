const fs = require("fs");
const path = require("path");

const writeLog = async (pasta, arquivo, formato, texto) => {
    try {
        var filePath = path.join(`./${pasta}`, `${arquivo}.${formato}`)
        var appendOptions = {};
        if (fs.existsSync(filePath)) {
            appendOptions = { flag: "a" };
        }
        fs.mkdir(`./${pasta}`, { recursive: true }, (err) => {
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
    } catch (error) {
        console.log("Erro ao criar arquivo de log!", error)
    }
}

module.exports = writeLog