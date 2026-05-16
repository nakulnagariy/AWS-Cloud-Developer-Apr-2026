import { mockProducts } from '../mock-data';

export const handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(mockProducts)
  };
};
