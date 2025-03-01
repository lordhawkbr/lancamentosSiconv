import pandas as pd

# Carregar o arquivo CSV original
input_file = "Filtrado_Folha.csv"
output_file = "new.csv"

# Lista de matrículas a serem excluídas
matriculas_excluir = [
    200009,200014,200034,200036,200053,200060,200073,200083,200088,200099,200143,200173
]

# Ler o arquivo CSV
df = pd.read_csv(input_file, sep=";", encoding="utf-8")

# Filtrar as linhas excluindo as matrículas especificadas
df_filtrado = df[df["Matricula"].isin(matriculas_excluir)]

# Salvar o resultado em um novo arquivo CSV
df_filtrado.to_csv(output_file, sep=";", index=False, encoding="utf-8")

print(f"Arquivo filtrado salvo como: {output_file}")