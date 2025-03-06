const writeLog = require("../funcs/writeLog")
const BANCOS_PAGAMENTO = require("../auxiliar/bancos")
const CONVENIOS = require("../auxiliar/convenios")
const dadosBancarios = require("../auxiliar/dadosBancarios")
const path = require("path");
const fs = require("fs");
const { logName } = require("../funcs/main")


const resetarJustificativa = async (fields) => {
    try {
        for (const field of fields) {
            await field.evaluate(el => el.value = "")
        }
    } catch (error) {
        console.log(`Erro ao resetar valor dos campos: ${error}`)
    }
}

const buscarHolerite = async (folderPath, fileName) => {
    const filePath = path.join(folderPath, `${fileName}.pdf`);
    if (fs.existsSync(filePath)) {
        return true
    } else {
        return false
    }
}

const buscarDadosBancarios = (CPF) => {
    const index = dadosBancarios.find(d => d.CPF == CPF)
    if (index != -1) {
        return dadosBancarios[index]
    } else {
        return false
    }
}

const preencherDados = async (item, page, DESCRICAO_ITEM, VALOR_BRUTO) => {
    const dadosBanco = buscarDadosBancarios(item["CPF"])
    if (dadosBanco) {
        await page.waitForSelector("#salvarNumero", { visible: true })
        await page.type("#salvarNumero", DESCRICAO_ITEM)

        await page.waitForSelector("#salvarCpfCredor", { visible: true })
        await page.type("#salvarCpfCredor", item["CPF"])

        await page.waitForSelector("#salvarDataDeEmissao", { visible: true })
        await page.type("#salvarDataDeEmissao", item["DtRef"])

        await page.waitForSelector("#salvarDataDeSaidaEntrada", { visible: true })
        await page.type("#salvarDataDeSaidaEntrada", item["DtPag"])

        await page.waitForSelector("#salvarValor", { visible: true })
        await page.click("#salvarValor")
        await page.type("#salvarValor", formatarNumero(VALOR_BRUTO))

        await page.waitForSelector("#salvarTipoPagamantoOBTV", { visible: true })
        await page.select("#salvarTipoPagamantoOBTV", "1")

        await page.evaluate(() => { carregaCamposPagamento("1") })

        await page.waitForSelector("#salvarInTipoConta", { visible: true })
        await page.select("#salvarInTipoConta", "1")
        await page.waitForSelector("#salvarBanco", { visible: true })

        await page.type("#salvarBanco", `${dadosBanco.BANCO}`)
        await page.waitForSelector("#salvarAgencia", { visible: true })
        await page.type("#salvarAgencia", `${dadosBanco.AGENCIA}`)
        await page.waitForSelector("#salvarConta", { visible: true })
        await page.type("#salvarConta", `${dadosBanco.CONTA}`)
        await page.waitForSelector("#salvarDigitoConta", { visible: true })
        await page.type("#salvarDigitoConta", `${dadosBanco.DIGITO}`)

        return true
    } else {
        return false
    }
}

const anexarHolerite = async (item, page, anexoPath, anexo, ref) => {
    if (anexo) {
        await page.waitForSelector("#tr-salvarNaoDigitalizar input[value='0']", { visible: true });
        await page.click("#tr-salvarNaoDigitalizar input[value='0']", { clickCount: 1 })
        await page.waitForSelector("input[type='file']", { visible: true });
        const inputUploadHandle = await page.$("input[type='file']");
        await inputUploadHandle.uploadFile(`${anexoPath}\\${ref}.PDF`)
        await page.waitForSelector(`#form_submit`, { visible: true })
        await page.click("#form_submit");
    } else {
        await page.waitForSelector("#tr-salvarNaoDigitalizar input[value='1']", { visible: true })
        await page.click("#tr-salvarNaoDigitalizar input[value='1']", { clickCount: 1 })
        await page.waitForSelector("#salvarJustificativa", { visible: true })
        const salvarJustificativa = await page.$("#salvarJustificativa");
        await page.type("#salvarJustificativa", "O contra-cheque não foi digitalizado devido a instabilidades e lentidão no portal, impedindo o envio do arquivo. Para evitar atrasos no pagamento, os lançamentos serão feitos sem o anexo, que será incluído posteriormente.")
    }
}

const codigosBancarios = (banco) => {
    const normalizeText = (text) => {
        return text
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9\s]/g, "")
            .trim()
            .toLowerCase();
    };
    const normalizedSearch = normalizeText(banco);
    return BANCOS_PAGAMENTO.filter(item => {
        const normalizedBanco = normalizeText(item.BANCO);
        return normalizedBanco.includes(normalizedSearch);
    });
};

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

const incluirDocLiquidacao = async (item, DESCRICAO_ITEM, countLines, page, anexo, anexoPath, totalItens) => {
    const ADMINISTRATIVO = item["ADMINISTRATIVO"] == "S" ? "1" : "0"
    const [PROVENTOS, DESCONTOS, VALOR_LIQUIDO] = calcularValores(item)
    const SALARIO = item.TiposVerba.Provento.find(e => e["Descricao Verba"] == "SALARIO")["Vlr. Lancam."]
    const [CHECKBOX_META, CHECKBOX_SERVICO, CHECKBOX_TRIBUTO] = CONVENIOS.find(e => e.convenio == item["CONVENIO"]).boxes

    try {
        if (countLines == 1) {
            await Promise.all([
                await page.goto(process.env.HOSTINICIO),
                await page.waitForSelector("#consultarNumeroConvenio", { visible: true }),
                await page.type("#consultarNumeroConvenio", `${item["CONVENIO"]}`),
                await page.waitForSelector("#form_submit", { visible: true }),
                await page.click("#form_submit")
            ])
            await page.waitForSelector("#tbodyrow > tr > td > div > a", { visible: true });
            await page.click("#tbodyrow > tr > td > div > a");
        } else {
            await Promise.all([
                await page.goto(process.env.HOSTRETORNO1),
                await page.waitForSelector("#consultarNumeroConvenio", { visible: true }),
                await page.type("#consultarNumeroConvenio", `${item["CONVENIO"]}`),
                await page.waitForSelector("#form_submit", { visible: true }),
                await page.click("#form_submit")
            ])
            await page.waitForSelector("#tbodyrow > tr > td > div > a", { visible: true });
            await page.click("#tbodyrow > tr > td > div > a");
            await Promise.all([
                await page.goto(process.env.HOSTRETORNO2),
                await page.waitForSelector("input[value='Incluir Documento de Liquidação']", { visible: true }),
                await page.click("input[value='Incluir Documento de Liquidação']")
            ])
        }
        /*anexo && await buscarHolerite(anexoPath, item["CPF"]) && item["CPF"].length == 11 || !anexo &&*/
        if (item["CPF"].length == 11) {
            try {
                await page.waitForSelector("#incluirDadosDocumentoTipoDocumentoContabil", { visible: true })
                await page.select("#incluirDadosDocumentoTipoDocumentoContabil", "22")
                await page.waitForSelector(`[id = "incluirDadosDocumentoDespesaAdministrativa"][value="${ADMINISTRATIVO}"]`, { visible: true })
                await page.click(`[id = "incluirDadosDocumentoDespesaAdministrativa"][value="${ADMINISTRATIVO}"]`)
                await page.waitForSelector("#form_submit", { visible: true })
                await page.click("#form_submit")
                await page.waitForNavigation()

                await page.waitForSelector("input[name='manterNotasFiscaisInserirDadosDaNotaFiscalPreencherDadosItensForm']", { visible: true })
                await page.click("input[name='manterNotasFiscaisInserirDadosDaNotaFiscalPreencherDadosItensForm']")

                //ITEM SERVIÇO
                await page.waitForSelector("#incluirItemNomeItem", { visible: true })
                await page.type("#incluirItemNomeItem", DESCRICAO_ITEM)
                await page.waitForSelector("#incluirItemDescricaoItem", { visible: true })
                await page.type("#incluirItemDescricaoItem", DESCRICAO_ITEM)
                await page.waitForSelector("#incluirItemCodUnidadeFornecimento", { visible: true })
                await page.type("#incluirItemCodUnidadeFornecimento", "MÊS")
                await page.waitForSelector("#incluirItemValorTotalItem", { visible: true })
                await page.click("#incluirItemValorTotalItem")
                await page.type("#incluirItemValorTotalItem", formatarNumero(PROVENTOS))
                await page.waitForSelector("#incluirItemQuantidadeItem", { visible: true })
                await page.type("#incluirItemQuantidadeItem", "1,00")

                await page.waitForSelector(`input[value="${CHECKBOX_META}"]`, { visible: true })
                await page.click(`input[value="${CHECKBOX_META}"]`)
                await page.waitForSelector(`#incluirItemRecursosRepasse${CHECKBOX_META}`, { visible: true })
                await page.type(`#incluirItemRecursosRepasse${CHECKBOX_META}`, formatarNumero(PROVENTOS))
                await page.waitForSelector(`input[value="${CHECKBOX_SERVICO}"]`, { visible: true })
                await page.click(`input[value="${CHECKBOX_SERVICO}"]`)
                await page.waitForSelector(`#form_submit`, { visible: true })
                await page.click("#form_submit");

                await page.waitForSelector("input[value='Voltar']", { visible: true })
                await page.click("input[value='Voltar']");

                await page.waitForSelector("input[value='Informar Tributos / Contribuições']", { visible: true })
                await page.click("input[value='Informar Tributos / Contribuições']");

                for (const itemD of item.TiposVerba.Desconto) {
                    const tipoVerba = itemD["Descricao Verba"]
                    const valorVerba = itemD["Vlr. Lancam."]
                    const fSALARIO = parseFloat(SALARIO.replace(",", "."))
                    const aliquotaVerba = obterAliquota(tipoVerba, fSALARIO)
                    const esferaTributo = ["IR", "INSS"].includes(tipoVerba) ? "FEDERAL" : "N.A"

                    if (tipoVerba == "IR" && fSALARIO > 2259.20 || tipoVerba == "INSS") {
                        await page.waitForSelector("#incluirTributoEsfera", { visible: true })
                        await page.select("#incluirTributoEsfera", esferaTributo)
                        await page.waitForSelector("#incluirTributoTipoFederal", { visible: true })
                        await page.select("#incluirTributoTipoFederal", tipoVerba)
                        await page.waitForSelector("#incluirTributoAliquota", { visible: true })
                        await page.type("#incluirTributoAliquota", aliquotaVerba)
                        await page.waitForSelector("#incluirTributoValor", { visible: true })
                        await page.type("#incluirTributoValor", formatarNumero(valorVerba))
                        await page.waitForSelector("#incluirTributoData", { visible: true })
                        await page.type("#incluirTributoData", item["DtRef"])
                        await page.waitForSelector("#incluirTributoDocumento", { visible: true })
                        await page.type("#incluirTributoDocumento", DESCRICAO_ITEM)
                        await page.waitForSelector("input[value='Incluir Tributo']", { visible: true })
                        await page.click("input[value='Incluir Tributo']");
                    }
                }

                // if (parseFloat(PENSAO_ALIMENTICIA.replace(",", ".")) > 0) {
                //     await page.waitForSelector("input[value='Contribuicao']", { visible: true })
                //     await page.click("input[value='Contribuicao']")
                //     await page.waitForSelector("#incluirContribuicaoDenominacao", { visible: true })
                //     await page.select("#incluirContribuicaoDenominacao", "Pensão Alimentícia")
                //     await page.waitForSelector("#incluirContribuicaoValorCont", { visible: true })
                //     await page.type("#incluirContribuicaoValorCont", PENSAO_ALIMENTICIA)
                //     await page.waitForSelector("input[value='Incluir Contribuição']", { visible: true })
                //     await page.click("input[value='Incluir Contribuição']")
                // }

                // if (parseFloat(SINDICATO.replace(",", ".")) > 0) {
                //     await page.waitForSelector("input[value='Contribuicao']", { visible: true })
                //     await page.click("input[value='Contribuicao']")
                //     await page.waitForSelector("#incluirContribuicaoDenominacao", { visible: true })
                //     await page.select("#incluirContribuicaoDenominacao", "Contribuição Sindical")
                //     await page.waitForSelector('#incluirContribuicaoValorCont')
                //     await page.type('#incluirContribuicaoValorCont', SINDICATO)
                //     await page.waitForSelector("input[value='Incluir Contribuição']", { visible: true })
                //     await page.click("input[value='Incluir Contribuição']")
                // }

                await page.waitForSelector("input[value='Voltar']", { visible: true })
                await page.click("input[value='Voltar']")

                if (await preencherDados(item, page, DESCRICAO_ITEM, PROVENTOS)) {
                    await anexarHolerite(item, page, anexoPath, anexo, item["CPF"])

                    // await new Promise(resolve => setTimeout(resolve, 100000000));

                    await page.waitForSelector("#salvarTipoPagamantoOBTV", { visible: true })
                    await page.select("#salvarTipoPagamantoOBTV", "1")

                    let isDialogHandled = false;

                    await Promise.all([
                        await page.on("dialog", async dialog => {
                            if (!isDialogHandled) {
                                isDialogHandled = true;
                                await dialog.accept();
                            }
                        })
                    ])

                    await page.waitForSelector("input[value='Salvar Definitivo']", { visible: true })
                    await Promise.all([page.click("input[value='Salvar Definitivo']"), page.waitForNavigation({ waitUntil: "networkidle2" })]);

                    const [hasError, errorMsg] = await page.evaluate(() => {
                        var errorDialog = document.querySelector("#popUpLayer2")
                        var errorMsg = errorDialog?.querySelector(".error").innerHTML.replaceAll("&nbsp", " ")
                        return [errorDialog !== null, errorMsg];
                    });

                    if (hasError) {
                        writeLog(logName, `${countLines} / ${totalItens} - ${DESCRICAO_ITEM}: erro ao incluir documento: ${errorMsg}`);
                        console.log(`${countLines} / ${totalItens} - ${DESCRICAO_ITEM}: erro ao incluir documento!`, errorMsg);
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
                    writeLog(logName, `${countLines} / ${totalItens} - ${DESCRICAO_ITEM}: esgotado tempo de execução do item! - TimeoutError`)
                    console.log(`${countLines}/${totalItens} - ${DESCRICAO_ITEM}: esgotado tempo de execução do item! - TimeoutError`)
                    return false
                } else {
                    writeLog(logName, `${countLines}/${totalItens} - ${DESCRICAO_ITEM}: Falha ao ler o item! - ${error}`)
                    console.log(`${countLines}/${totalItens} - ${DESCRICAO_ITEM}: Falha ao ler o item! - ${error}`)
                    return false
                }
            }
        } else {
            writeLog(logName, `${DESCRICAO_ITEM}: condições para leitura do item não foram atendidas!(Anexo em falta e / ou CPF inválido)`)
            return false
        }
    } catch (error) {
        console.log(`${DESCRICAO_ITEM}: erro ao iniciar inclusão de documento: ${error} `)
        writeLog(logName, `${DESCRICAO_ITEM}: erro ao iniciar inclusão de documento: ${error} `);
        return false;
    }
};

const escapeXPath = (value) => { return value.replace(/"/g, '\\"') }

const pagamentoOBTV = async (item, DESCRICAO_ITEM, countLines, page) => {
    try {
        if (countLines === 0) {
            // await page.goto(process.env.HOSTPGOBTV1, { waitUntil: "networkidle2" });
            await Promise.all([
                page.waitForSelector("#menuPrincipal > div.col1 > div.button.menu.menuSelecionado", { visible: true }),
                page.click("#menuPrincipal > div.col1 > div.button.menu.menuSelecionado"),
                page.waitForSelector("#contentMenu > div:nth-child(3) > ul > li:nth-child(6) > a", { visible: true }),
                page.click("#contentMenu > div:nth-child(3) > ul > li:nth-child(6) > a")
            ]);
            await page.waitForSelector("#consultarNumeroConvenio", { visible: true });
            await page.type("#consultarNumeroConvenio", `${item["CONVENIO"]}`);
            await page.waitForSelector("#form_submit", { visible: true });
            await Promise.all([
                page.click("#form_submit"),
                page.waitForNavigation({ waitUntil: "networkidle2" })
            ]);
            await page.waitForSelector("#tbodyrow > tr > td > div > a", { visible: true });
            await Promise.all([
                page.click("#tbodyrow > tr > td > div > a"),
                page.waitForNavigation({ waitUntil: "networkidle2" })
            ]);
            await page.waitForSelector("input[value='Novo Pagamento']", { visible: true });
            await Promise.all([
                await page.click("input[value='Novo Pagamento']"),
                page.waitForNavigation({ waitUntil: "networkidle2" })
            ]);
        } else {
            await page.goto(process.env.HOSTPGOBTV2, { waitUntil: "networkidle2" });
            await page.waitForSelector("input[value='Novo Pagamento']", { visible: true });
            await Promise.all([
                await page.click("input[value='Novo Pagamento']"),
                page.waitForNavigation({ waitUntil: "networkidle2" })
            ]);
        }

        // let [opcaoEncontrada] = await page.$x(`//option[contains(., "${item["Matricula"]}")]`);
        let [opcaoEncontrada] = await page.$x(`//option[contains(., "${escapeXPath(item["Matricula"])}")]`);
        if (opcaoEncontrada) {
            let optValue = await (await opcaoEncontrada.getProperty("value")).jsonValue();
            await page.select(`#formEditarPagamentoOBTV\\:manterPagamentoOBTVControleNotaFiscalCombo`, optValue)
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

                await page.waitForSelector("#textoObservacaoPagamento", { visible: true });
                await page.type("#textoObservacaoPagamento", `PGTO ${DESCRICAO_ITEM}`);

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

                await page.waitForSelector("input[value='Concluir Pagamento']", { visible: true })
                await Promise.all([page.click("input[value='Concluir Pagamento']"), page.waitForNavigation({ waitUntil: "networkidle2", visible: true })]);

                const [hasError, errorMsg] = await page.evaluate(() => {
                    var errorDialog = document.querySelector("#popUpLayer2")
                    var errorMsg = errorDialog?.querySelector(".error").innerHTML.replaceAll("&nbsp", " ")
                    return [errorDialog !== null, errorMsg];
                });

                if (hasError) {
                    writeLog(logName, `${DESCRICAO_ITEM}: erro ao relizar pagamento OBTV: ${errorMsg}`);
                    console.log(`${DESCRICAO_ITEM}: erro ao relizar pagamento OBTV: ${errorMsg}`);
                    return false;
                } else {
                    return true
                }
            }
        } else {
            writeLog(logName, `${DESCRICAO_ITEM}: item não encontrado p/ seleção de pagamento OBTV!`)
            console.log(`${DESCRICAO_ITEM}: item não encontrado p/ seleção de pagamento OBTV!`)
            return false
        }
    } catch (error) {
        console.log(`${DESCRICAO_ITEM}: erro ao iniciar pagamento OBTV: ${error} `)
        writeLog(logName, `${DESCRICAO_ITEM}: erro ao iniciar pagamento OBTV: ${error} `);
        return false;
    }
}

module.exports = {
    incluirDocLiquidacao,
    pagamentoOBTV
}