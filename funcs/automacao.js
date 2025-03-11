const writeLog = require("../funcs/writeLog")
const BANCOS_PAGAMENTO = require("../auxiliar/bancos")
const CONVENIOS = require("../auxiliar/convenios")
const dadosBancarios = require("../auxiliar/dadosBancarios")
const path = require("path");
const fs = require("fs");
const { logName } = require("../funcs/main")

const buscarHolerite = async (folderPath, fileName) => {
    const filePath = path.join(folderPath, `${fileName}.pdf`);
    if (fs.existsSync(filePath)) {
        return true
    } else {
        return false
    }
}

const buscarDadosBancarios = (CPF) => {
    const index = dadosBancarios.findLastIndex(d => d.CPF == CPF)
    if (index != -1) {
        return dadosBancarios[index]
    } else {
        return false
    }
}

const preencherDados = async (item, page, DESCRICAO_ITEM, VALOR_BRUTO) => {
    const dadosBanco = buscarDadosBancarios(item["CPF"])
    if (dadosBanco) {
        await preencherCampo(page, "type", "#salvarNumero", DESCRICAO_ITEM, false);
        await preencherCampo(page, "type", "#salvarCpfCredor", item["CPF"], false);
        await preencherCampo(page, "type", "#salvarDataDeEmissao", item["DtRef"], false);
        await preencherCampo(page, "type", "#salvarDataDeSaidaEntrada", item["DtPag"], false);
        await preencherCampo(page, "type", "#salvarValor", formatarNumero(VALOR_BRUTO), false);
        await preencherCampo(page, "select", "#salvarTipoPagamantoOBTV", "1", false);

        await page.evaluate(() => { carregaCamposPagamento("1") })

        await preencherCampo(page, "select", "#salvarInTipoConta", "1", false);
        await preencherCampo(page, "type", "#salvarBanco", dadosBanco.BANCO, false);
        await preencherCampo(page, "type", "#salvarAgencia", dadosBanco.AGENCIA, false);
        await preencherCampo(page, "type", "#salvarConta", dadosBanco.CONTA, false);
        await preencherCampo(page, "type", "#salvarDigitoConta", dadosBanco.DIGITO, false);
        return true
    } else {
        return false
    }
}

const anexarHolerite = async (item, page, anexoPath, anexo, ref) => {
    if (anexo) {
        await clicarEAguardar(page, true, "#tr-salvarNaoDigitalizar input[value='0']");
        await page.waitForSelector("input[type='file']", { visible: true });
        const inputUploadHandle = await page.$("input[type='file']");
        await inputUploadHandle.uploadFile(`${anexoPath}\\${ref}.PDF`)
        await clicarEAguardar(page, true, "#form_submit");
    } else {
        await clicarEAguardar(page, true, "#tr-salvarNaoDigitalizar input[value='1']");
        await page.$("#salvarJustificativa");
        await preencherCampo(page, "type", "#salvarJustificativa", "O contra-cheque não foi digitalizado devido a instabilidades e lentidão no portal, impedindo o envio do arquivo. Para evitar atrasos no pagamento, os lançamentos serão feitos sem o anexo, que será incluído posteriormente.", false)
    }
}

const formatarNumero = (valor) => {
    const numero = typeof valor === "string" ? parseFloat(valor.replace(",", ".")) : parseFloat(valor);
    if (isNaN(numero)) return valor;
    return numero.toFixed(2).replace(".", ",");
};

const calcularValores = (item) => {
    let valorProventos = 0;
    let valorDescontos = 0;
    const converterValor = (valor) => {
        if (typeof valor === "string") {
            return parseFloat(valor.replace(",", "."));
        }
        return parseFloat(valor);
    };
    if (Array.isArray(item.TiposVerba?.Provento)) {
        for (const itemP of item.TiposVerba.Provento) {
            const valorLancamento = converterValor(itemP["Vlr. Lancam."]);
            valorProventos += valorLancamento || 0;
        }
    }
    if (Array.isArray(item.TiposVerba?.Desconto)) {
        for (const itemD of item.TiposVerba.Desconto) {
            const valorLancamento = converterValor(itemD["Vlr. Lancam."]);
            valorDescontos += valorLancamento || 0;
        }
    }
    const valorLiquido = valorProventos - valorDescontos;
    return [valorProventos, valorDescontos, valorLiquido];
};

const obterAliquota = (tipoVerba, SALARIO) => {
    let aliquota;

    if (tipoVerba === "IR") {
        if (SALARIO >= 2259.21 && SALARIO <= 2826.65) {
            aliquota = "7,50";
        } else if (SALARIO >= 2826.66 && SALARIO <= 3751.05) {
            aliquota = "15,00";
        } else if (SALARIO >= 3751.06 && SALARIO <= 4664.68) {
            aliquota = "22,50";
        } else if (SALARIO > 4664.68) {
            aliquota = "27,50";
        }
    } else if (tipoVerba === "INSS") {
        if (SALARIO <= 1518) {
            aliquota = "7,50";
        } else if (SALARIO > 1518 && SALARIO <= 2793.88) {
            aliquota = "9,00";
        } else if (SALARIO > 2793.88 && SALARIO <= 4190.84) {
            aliquota = "12,00";
        } else if (SALARIO > 4190.84 /*&& SALARIO <= 8157.41*/) {
            aliquota = "14,00";
        }
    }

    return aliquota;
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

const incluirDocLiquidacao = async (item, DESCRICAO_ITEM, countLines, page, anexo, anexoPath, totalItens) => {
    const ADMINISTRATIVO = item["ADMINISTRATIVO"] == "S" ? "1" : "0"
    const [PROVENTOS, DESCONTOS, VALOR_LIQUIDO] = calcularValores(item)
    const SALARIO = item.TiposVerba.Provento.find(e => e["Descricao Verba"].includes("SALARIO"))["Vlr. Lancam."]

    const [CHECKBOX_META, CHECKBOX_SERVICO, CHECKBOX_TRIBUTO] = CONVENIOS.find(e => e.convenio == item["CONVENIO"]).boxes

    try {
        if (countLines == 1) {
            await page.goto(process.env.HOSTINICIO)
            await preencherCampo(page, "type", "#consultarNumeroConvenio", item["CONVENIO"], false)
            await clicarEAguardar(page, true, "#form_submit")
            await clicarEAguardar(page, true, "#tbodyrow > tr > td > div > a")
        } else {
            await page.goto(process.env.HOSTRETORNO1)
            await preencherCampo(page, "type", "#consultarNumeroConvenio", item["CONVENIO"], false)
            await clicarEAguardar(page, true, "#form_submit")
            await clicarEAguardar(page, true, "#tbodyrow > tr > td > div > a")

            await page.goto(process.env.HOSTRETORNO2)
            
            await clicarEAguardar(page, true, "input[value='Incluir Documento de Liquidação']")
        }
        if (item["CPF"].length == 11) {
            try {
                await preencherCampo(page, "select", "#incluirDadosDocumentoTipoDocumentoContabil", "22", false)
                await clicarEAguardar(page, false, `[id="incluirDadosDocumentoDespesaAdministrativa"][value="${ADMINISTRATIVO}"]`)
                await clicarEAguardar(page, true, "#form_submit")
                await clicarEAguardar(page, true, "input[name='manterNotasFiscaisInserirDadosDaNotaFiscalPreencherDadosItensForm']")
                await preencherCampo(page, "type", "#incluirItemNomeItem", DESCRICAO_ITEM, false)
                await preencherCampo(page, "type", "#incluirItemDescricaoItem", DESCRICAO_ITEM, false)
                await preencherCampo(page, "type", "#incluirItemCodUnidadeFornecimento", "MÊS", false)
                await preencherCampo(page, "type", "#incluirItemValorTotalItem", formatarNumero(PROVENTOS), false)
                await preencherCampo(page, "type", "#incluirItemQuantidadeItem", "1,00", false)
                await clicarEAguardar(page, false, `input[value="${CHECKBOX_META}"]`)
                await preencherCampo(page, "type", `#incluirItemRecursosRepasse${CHECKBOX_META}`, formatarNumero(PROVENTOS), false);
                await clicarEAguardar(page, false, `input[value="${CHECKBOX_SERVICO}"]`)
                await clicarEAguardar(page, true, "input[value='Salvar e incluir novo item']");
                await clicarEAguardar(page, true, "input[value='Voltar']");
                await clicarEAguardar(page, true, "input[value='Informar Tributos / Contribuições']");

                for (const itemD of item.TiposVerba.Desconto) {
                    const tipoVerba = itemD["Descricao Verba"];
                    const valorVerba = itemD["Vlr. Lancam."];
                    const fSALARIO = parseFloat(SALARIO.replace(",", "."));
                    const aliquotaVerba = obterAliquota(tipoVerba, fSALARIO);
                    const esferaTributo = ["IR", "INSS"].includes(tipoVerba) ? "FEDERAL" : "N.A";

                    if ((tipoVerba === "IR" && fSALARIO > 2259.20) || tipoVerba === "INSS") {
                        await preencherCampo(page, "select", "#incluirTributoEsfera", esferaTributo, false);
                        await preencherCampo(page, "select", "#incluirTributoTipoFederal", tipoVerba, false);
                        await preencherCampo(page, "type", "#incluirTributoAliquota", aliquotaVerba, false);
                        await preencherCampo(page, "type", "#incluirTributoValor", formatarNumero(valorVerba), false);
                        await preencherCampo(page, "type", "#incluirTributoData", item["DtRef"], false);
                        await preencherCampo(page, "type", "#incluirTributoDocumento", DESCRICAO_ITEM, false);
                        await clicarEAguardar(page, true, "input[value='Incluir Tributo']");
                    }
                }

                await clicarEAguardar(page, true, "input[value='Voltar']");

                if (await preencherDados(item, page, DESCRICAO_ITEM, PROVENTOS)) {
                    await anexarHolerite(item, page, anexoPath, anexo, item["CPF"])
                    await preencherCampo(page, "select", "#salvarTipoPagamantoOBTV", "1", false);

                    let isDialogHandled = false;

                    await new Promise(resolve => setTimeout(resolve, 10000000));

                    await Promise.all([
                        await page.on("dialog", async dialog => {
                            if (!isDialogHandled) {
                                isDialogHandled = true;
                                await dialog.accept();
                            }
                        })
                    ])

                    await clicarEAguardar(page, true, "input[value='Salvar Definitivo']");

                    const [hasError, errorMsg] = await page.evaluate(() => {
                        var errorDialog = document.querySelector("#popUpLayer2")
                        var errorMsg = errorDialog?.querySelector(".error").innerHTML.replaceAll("&nbsp", " ")
                        return [errorDialog !== null, errorMsg];
                    });

                    if (hasError) {
                        writeLog(logName, `${countLines} / ${totalItens} - ${DESCRICAO_ITEM}-${item["CPF"]}: erro ao incluir documento: ${errorMsg}`);
                        console.log(`${countLines} / ${totalItens} - ${DESCRICAO_ITEM}-${item["CPF"]}: erro ao incluir documento!`, errorMsg);
                        return false;
                    } else {
                        return true
                    }
                } else {
                    writeLog(logName, `${countLines} / ${totalItens} - ${DESCRICAO_ITEM}: Dados bancários não encontrados para o CPF: ${item["CPF"]}!`);
                    console.log(`${countLines} / ${totalItens} - ${DESCRICAO_ITEM}: Dados bancários não encontrados para o CPF: ${item["CPF"]}!`)
                    return false;
                }
            } catch (error) {
                if (error.name === "TimeoutError") {
                    writeLog(logName, `${countLines} / ${totalItens} - ${DESCRICAO_ITEM}-${item["CPF"]}: esgotado tempo de execução do item! - TimeoutError`)
                    console.log(`${countLines}/${totalItens} - ${DESCRICAO_ITEM}-${item["CPF"]}: esgotado tempo de execução do item! - TimeoutError`)
                    return false
                } else {
                    writeLog(logName, `${countLines}/${totalItens} - ${DESCRICAO_ITEM}-${item["CPF"]}: Falha ao ler o item! - ${error}`)
                    console.log(`${countLines}/${totalItens} - ${DESCRICAO_ITEM}-${item["CPF"]}: Falha ao ler o item! - ${error}`)
                    return false
                }
            }
        } else {
            writeLog(logName, `${DESCRICAO_ITEM}-${item["CPF"]}: condições para leitura do item não foram atendidas!(Anexo em falta e / ou CPF inválido)`)
            return false
        }
    } catch (error) {
        console.log(`${DESCRICAO_ITEM}-${item["CPF"]}: erro ao iniciar inclusão de documento: ${error} `)
        writeLog(logName, `${DESCRICAO_ITEM}-${item["CPF"]}: erro ao iniciar inclusão de documento: ${error} `);
        return false;
    }
};

const escapeXPath = (value) => { return value.replace(/"/g, '\\"') }

const pagamentoOBTV = async (item, DESCRICAO_ITEM, countLines, page) => {
    try {
        if (countLines == 1) {
            await Promise.all([
                await page.goto(process.env.HOSTPGOBTV1, { waitUntil: "networkidle2" })
            ]);
            await preencherCampo(page, "type", "#consultarNumeroConvenio", item["CONVENIO"], false);
            await clicarEAguardar(page, true, "#form_submit");
            await clicarEAguardar(page, true, "#tbodyrow > tr > td > div > a");
            await clicarEAguardar(page, true, "input[value='Novo Pagamento']");
        } else {
            await page.goto(process.env.HOSTPGOBTV2, { waitUntil: "networkidle2" });
            await clicarEAguardar(page, true, "input[value='Novo Pagamento']");
        }

        let [opcaoEncontrada] = await page.$x(`//option[contains(., "${escapeXPath(item["Matricula"])}")]`);
        if (opcaoEncontrada) {
            let optValue = await (await opcaoEncontrada.getProperty("value")).jsonValue();
            await preencherCampo(page, "type", "#formEditarPagamentoOBTV\\:manterPagamentoOBTVControleNotaFiscalCombo", optValue, true);
            const loaded = await page.waitForFunction(() => {
                const carregando = document.querySelector(".carregando")
                return !carregando || carregando.style.display === "none"
            });
            const isLoaded = await loaded.jsonValue()
            if (isLoaded) {
                await page.waitForSelector("#formEditarPagamentoOBTV\\:DetalhesPagamento_lbl", { visible: true, timeout: process.env.TIMEOUT })
                await Promise.all([await page.click("#formEditarPagamentoOBTV\\:DetalhesPagamento_lbl"), page.waitForNavigation({ waitUntil: "networkidle2" })]);

                await Promise.all([
                    page.click("#formEditarPagamentoOBTV\\:DetalhesPagamento_lbl"),
                    page.waitForFunction(() => {
                        const textoObservacao = document.querySelector("#textoObservacaoPagamento");
                        return textoObservacao && textoObservacao.offsetParent !== null;
                    }, { timeout: process.env.TIMEOUT })
                ]);

                await preencherCampo(page, "type", "#textoObservacaoPagamento", `PGTO ${DESCRICAO_ITEM}`, false);

                await new Promise(resolve => setTimeout(resolve, 1000));

                let isDialogHandled = false;
                await Promise.all([
                    await page.on("dialog", async dialog => {
                        if (!isDialogHandled) {
                            isDialogHandled = true;;
                            await dialog.accept();
                        }
                    })
                ])

                await clicarEAguardar(page, true, "input[value='Concluir Pagamento']");

                // await page.waitForSelector("input[value='Concluir Pagamento']", { visible: true })
                // await Promise.all([page.click("input[value='Concluir Pagamento']"), page.waitForNavigation({ waitUntil: "networkidle2", visible: true })]);

                const [hasError, errorMsg] = await page.evaluate(() => {
                    var errorDialog = document.querySelector("#popUpLayer2")
                    var errorMsg = errorDialog?.querySelector(".error").innerHTML.replaceAll("&nbsp", " ")
                    return [errorDialog !== null, errorMsg];
                });

                if (hasError) {
                    writeLog(logName, `${DESCRICAO_ITEM}-${item["CPF"]}: erro ao relizar pagamento OBTV: ${errorMsg}`);
                    console.log(`${DESCRICAO_ITEM}-${item["CPF"]}: erro ao relizar pagamento OBTV: ${errorMsg}`);
                    return false;
                } else {
                    return true
                }
            }
        } else {
            writeLog(logName, `${DESCRICAO_ITEM}-${item["CPF"]}: item não encontrado p/ seleção de pagamento OBTV!`)
            console.log(`${DESCRICAO_ITEM}-${item["CPF"]}: item não encontrado p/ seleção de pagamento OBTV!`)
            return false
        }
    } catch (error) {
        console.log(`${DESCRICAO_ITEM}-${item["CPF"]}: erro ao iniciar pagamento OBTV: ${error} `)
        writeLog(logName, `${DESCRICAO_ITEM}-${item["CPF"]}: erro ao iniciar pagamento OBTV: ${error} `);
        return false;
    }
}

module.exports = {
    incluirDocLiquidacao,
    pagamentoOBTV
}