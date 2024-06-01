const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const NodeCache = require('node-cache');
const app = express();

const BASE_URL = "http://20.244.56.144/test/companies";
const COMPANIES = ["AMZ", "FLP", "SP", "MYN", "AZO"];
const cache = new NodeCache({ stdTTL: 300, checkperiod: 120 });
const BEARER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiZXhwIjoxNzE3MjI4MjExLCJpYXQiOjE3MTcyMjc5MTEsImlzcyI6IkFmZm9yZG1lZCIsImp0aSI6IjI5ZDUyOWViLTRjYTgtNDdmNi05ZjQwLTliNzU5ZGI3MmM5NiIsInN1YiI6IjIxaXQzMDI2QHJnaXB0LmFjLmluIn0sImNvbXBhbnlOYW1lIjoiYWZmb3JkbWVkIiwiY2xpZW50SUQiOiIyOWQ1MjllYi00Y2E4LTQ3ZjYtOWY0MC05Yjc1OWRiNzJjOTYiLCJjbGllbnRTZWNyZXQiOiJuR2dvSmtMYVpkRGhRT2RLIiwib3duZXJOYW1lIjoiU3VkaGFuc2h1Iiwib3duZXJFbWFpbCI6IjIxaXQzMDI2QHJnaXB0LmFjLmluIiwicm9sbE5vIjoiMjFpdDMwMjYifQ.Kt47M9xz4sFOvPVD5-j5q_RRUX0pLByDsWqZi-UWTmM";
function generateUnqId(product) {
    const uniqueString = `${product.productName}${crypto.randomUUID()}`;
    return crypto.createHash('md5').update(uniqueString).digest('hex');
}

async function fetchProdFromCompany(company, category, top, minPrice, maxPrice) {
    const cacheKey = `${company}-${category}-${top}-${minPrice}-${maxPrice}`;
    const url = `${BASE_URL}/${company}/categories/${category}/products?top=${top}&minPrice=${minPrice}&maxPrice=${maxPrice}`;
    const cached = cache.get(cacheKey);

    const headers = cached ? { 
        'If-None-Match': cached.etag,
        'Authorization': `Bearer ${BEARER_TOKEN}`
    } : {
        'Authorization': `Bearer ${BEARER_TOKEN}`
    };

    try {
        const response = await axios.get(url, { headers });

        if (response.status === 200) {
            const products = response.data.map(product => ({
                ...product,
                id: generateUnqId(product),
                company
            }));
            cache.set(cacheKey, { etag: response.headers.etag, products });
            return products;
        } else if (response.status === 304 && cached) {
            return cached.products;
        }
    } catch (error) {
        console.error(`Error fetching products from ${company}:`, error);
    }

    return [];
}

async function aggrProducts(category, top, minPrice, maxPrice) {
    const promises = COMPANIES.map(company => 
        fetchProdFromCompany(company, category, top, minPrice, maxPrice)
    );
    const results = await Promise.all(promises);
    return results.flat();
}

app.get('/categories/:category/products', async (req, res) => {
    const { category } = req.params;
    const top = parseInt(req.query.n, 10) || 10;
    const minPrice = parseFloat(req.query.minPrice) || 0;
    const maxPrice = parseFloat(req.query.maxPrice) || Infinity;
    const sortBy = req.query.sort || 'price';
    const sortOrder = req.query.order === 'desc' ? 'desc' : 'asc';
    const page = parseInt(req.query.page, 10) || 1;

    const products = await aggrProducts(category, 100, minPrice, maxPrice);

    if (['price', 'rating', 'discount', 'company'].includes(sortBy)) {
        products.sort((a, b) => {
            if (a[sortBy] < b[sortBy]) return sortOrder === 'asc' ? -1 : 1;
            if (a[sortBy] > b[sortBy]) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }

    const totalProducts = products.length;
    const totalPages = Math.ceil(totalProducts / top);

    if (page > totalPages) {
        return res.status(404).json({ error: 'Page not found' });
    }

    const start = (page - 1) * top;
    const end = start + top;
    const paginatedProducts = products.slice(start, end);

    res.json({
        totalProducts,
        totalPages,
        currentPage: page,
        products: paginatedProducts
    });
});

app.get('/categories/:category/products/:productId', async (req, res) => {
    const { category, productId } = req.params;

    const products = await aggrProducts(category, 100, 0, Infinity);

    const product = products.find(p => p.id === productId);

    if (product) {
        res.json(product);
    } else {
        res.status(404).json({ error: 'Product not found' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
