import "dotenv/config";
import prisma from "../src/lib/prisma";

async function main() {
  const count = await prisma.sala.count();
  if (count > 0) {
    console.log("[Seed] Salas já populadas, pulando...");
    return;
  }

  await prisma.sala.createMany({
    data: [
      {
        nome: "Sala 1",
        capacidade: 4,
        andar: 1,
        recursos: JSON.stringify(["quadro", "wifi", "ar-condicionado"]),
        icon: "users",
        status: "livre",
      },
      {
        nome: "Sala 2",
        capacidade: 6,
        andar: 1,
        recursos: JSON.stringify(["projetor", "wifi", "ar-condicionado"]),
        icon: "presentation",
        status: "livre",
      },
      {
        nome: "Sala 3",
        capacidade: 3,
        andar: 2,
        recursos: JSON.stringify(["tv", "wifi", "ar-condicionado"]),
        icon: "video",
        status: "livre",
      },
      {
        nome: "Sala 4",
        capacidade: 2,
        andar: 2,
        recursos: JSON.stringify(["quadro", "wifi"]),
        icon: "briefcase",
        status: "livre",
      },
    ],
  });

  console.log("[Seed] 4 salas inseridas com sucesso");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("[Seed] Erro:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
