if (Deno.env.get('meow') == 'woof') {
  console.log(Deno.env.toObject())
  Deno.exit(5);
}

export default async () => {
  console.log(Deno.env.toObject())
  Deno.exit(5);
  return new Response
};

export const config: Config = {
  path: "/*",
};
