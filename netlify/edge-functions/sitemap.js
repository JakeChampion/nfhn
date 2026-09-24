export default () => {
  console.log('boo')
  return new Response('si');
};

export const config = {
  path: "/*",
};
