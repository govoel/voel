import axios from 'axios';

import { scanLogger } from '@/logger';

const audible = axios.create({
  baseURL: 'https://api.audible.com/1.0',
});

export interface Product {
  authors?: { name: string }[];
  narrators?: { name: string }[];
  publisher_name?: string;
  title?: string;
  copyright?: string;
  total_results: number;
  asin?: string;
}

export const getProductByAsin = async (asin: string) => {
  try {
    scanLogger.debug('[ASIN:%s] Fetching product details from Audible API', asin);
    const response = await audible.get(`/catalog/products/${asin}`, {
      params: {
        response_groups:
          'contributors,media,product_attrs,product_desc,product_details,product_extended_attrs,series,relationships,category_ladders',
      },
    });

    if (
      response.data &&
      'product' in response.data &&
      'title' in response.data.product &&
      'authors' in response.data.product
    ) {
      scanLogger.debug('[ASIN:%s] Successfully retrieved full product', asin);
      return response.data.product as Product & { __brand: 'ASINResponse' };
    }
    scanLogger.debug('[ASIN:%s] Retrieved incomplete product data, missing required fields', asin);
    return null;
  } catch (error) {
    scanLogger.error('[ASIN:%s] Failed to fetch product: %s', asin, error);
    return null;
  }
};

export const getProductsBySearch = async (params: {
  author?: string;
  title: string;
  publisher?: string;
}) => {
  try {
    scanLogger.debug('[Search] Querying Audible API with query params: %o', params);
    const response = await audible.get('/catalog/products', {
      params: {
        response_groups: 'contributors,product_desc,product_details',
        num_results: 50,
        page: 0,
        ...params,
      },
    });

    if (response.data && 'products' in response.data) {
      const productCount = response.data.products.length;
      scanLogger.debug('[Search] Found %d products for query params: %o', productCount, params);
      return response.data.products as Product[];
    }
  } catch (error) {
    scanLogger.error('[Search] Query failed for query params %o: %s', params, error);
  }

  scanLogger.debug('[Search] No products found for query params: %o', params);
  return [];
};
