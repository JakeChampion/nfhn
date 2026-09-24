export default () => {
  console.log('boop')
  return new Response('si');
};

export const config = {
  path: "/*",
};
