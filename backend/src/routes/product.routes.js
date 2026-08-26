const { Router } = require('express');
const { getProducts, getProductStats, getProduct, createProduct, updateProduct, deleteProduct, addVariant, getCategories, getBrands } = require('../controllers/product.controller');
const { authenticate, requireTenant, requirePermission, enforceLimit } = require('../middleware/auth.middleware');
const { pushProductToChannels } = require('../services/channel.service');

const router = Router();
router.use(authenticate, requireTenant);

router.get('/',           requirePermission('products.read'), getProducts);
router.get('/stats',      requirePermission('products.read'), getProductStats);
router.get('/categories', requirePermission('products.read'), getCategories);
router.get('/brands',     requirePermission('products.read'), getBrands);
router.get('/:id',        requirePermission('products.read'), getProduct);
router.post('/',          requirePermission('products.create'), enforceLimit('skus'), createProduct);
router.put('/:id',        requirePermission('products.update'), updateProduct);
router.delete('/:id',     requirePermission('products.delete'), deleteProduct);
router.post('/:id/variants', requirePermission('products.update'), addVariant);

router.post(
  '/:id/sync-channels',
  requirePermission('channels.sync'),
  async (req, res) => {
    try {
      const result = await pushProductToChannels(req.params.id, {
        channelIds: req.body?.channelIds || null,
        tenantId: req.tenant.id,
      });
      res.json({ message: 'Product push complete', ...result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

module.exports = router;
