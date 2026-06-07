export async function hf(model, input) {
  const res = await fetch(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.HF_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: input })
    }
  );
  return await res.json();
}
