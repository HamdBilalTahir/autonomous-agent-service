import { graph } from "../lib/graph";

async function main() {
  try {
    const mermaid = await graph.getGraph().drawMermaid();
    console.log("\n=== LangGraph Visualization (Mermaid) ===\n");
    console.log(mermaid);
    console.log("\n=========================================\n");
    console.log(
      "Copy and paste the above into https://mermaid.live to visualize.",
    );
  } catch (error) {
    console.error("Failed to generate graph visualization:", error);
  }
}

main();
