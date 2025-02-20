import pandas as pd

# Carregar o arquivo CSV original
input_file = "Filtrado_Folha.csv"
output_file = "new.csv"

# Lista de matrículas a serem excluídas
matriculas_excluir = [
    400009,400015,400033,400060,400061,400068,400083,400125,400126,400169,400173,400182,400183,400188,400197,400198,400218,400236,400244,400252,400255,400258,400279,400288,400295,400296,400306,400311,400337,400344,400349,400351,400352,400370,400371
]

# Ler o arquivo CSV
df = pd.read_csv(input_file, sep=";", encoding="utf-8")

# Filtrar as linhas excluindo as matrículas especificadas
df_filtrado = df[df["Matricula"].isin(matriculas_excluir)]

# Salvar o resultado em um novo arquivo CSV
df_filtrado.to_csv(output_file, sep=";", index=False, encoding="utf-8")

print(f"Arquivo filtrado salvo como: {output_file}")