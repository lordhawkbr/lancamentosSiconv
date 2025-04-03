import pandas as pd

# Arquivos
input_file = "ARQUIVO_TOTAL.csv"
output_file = "ARQUIVO_PARCIAL.csv"

# Lista de matrículas a remover
matriculas = []

# Ler CSV ignorando linhas com erro de colunas
df = pd.read_csv(input_file, sep=";", encoding="utf-8", dtype={"Matricula": str}, engine="python", on_bad_lines="skip")

# Filtrar removendo matrículas indesejadas
df_filtrado = df[~df["Matricula"].isin(matriculas)]
#Filtrar e manter as matriculas desejadas
# df_filtrado = df[df["Matricula"].isin(matriculas)]

# Salvar novo arquivo
df_filtrado.to_csv(output_file, sep=";", index=False, encoding="utf-8")

print(f"Arquivo filtrado salvo como: {output_file}")
