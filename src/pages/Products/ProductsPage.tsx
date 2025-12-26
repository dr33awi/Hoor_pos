import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Card, CardHeader, Button, Input, Modal } from '@/components/ui';
import { db } from '@/db';
import type { Brand, Model, Variant } from '@/types';
import { useUIStore } from '@/stores';

export function ProductsPage() {
  const { showToast } = useUIStore();
  
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState<number | null>(null);
  
  // Modals
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [showModelModal, setShowModelModal] = useState(false);
  const [showVariantModal, setShowVariantModal] = useState(false);
  
  // Form states
  const [brandForm, setBrandForm] = useState({ name: '', nameAr: '' });
  const [modelForm, setModelForm] = useState({ 
    name: '', nameAr: '', category: '', description: '' 
  });
  const [variantForm, setVariantForm] = useState({
    color: '', colorAr: '', size: '', sku: '', barcode: '',
    salePrice: '', costPrice: ''
  });

  // Load data
  useEffect(() => {
    loadBrands();
  }, []);

  useEffect(() => {
    if (selectedBrand) {
      loadModels(selectedBrand);
    } else {
      setModels([]);
    }
  }, [selectedBrand]);

  useEffect(() => {
    if (selectedModel) {
      loadVariants(selectedModel);
    } else {
      setVariants([]);
    }
  }, [selectedModel]);

  const loadBrands = async () => {
    const data = await db.brands.filter(b => b.isActive).toArray();
    setBrands(data);
  };

  const loadModels = async (brandId: number) => {
    const data = await db.models
      .where('brandId')
      .equals(brandId)
      .filter(m => m.isActive)
      .toArray();
    setModels(data);
  };

  const loadVariants = async (modelId: number) => {
    const data = await db.variants
      .where('modelId')
      .equals(modelId)
      .filter(v => v.isActive)
      .toArray();
    setVariants(data);
  };

  const saveBrand = async () => {
    if (!brandForm.name) {
      showToast('الرجاء إدخال اسم الماركة', 'warning');
      return;
    }
    
    await db.brands.add({
      name: brandForm.name,
      nameAr: brandForm.nameAr,
      isActive: true,
    });
    
    showToast('تمت إضافة الماركة بنجاح', 'success');
    setShowBrandModal(false);
    setBrandForm({ name: '', nameAr: '' });
    loadBrands();
  };

  const saveModel = async () => {
    if (!modelForm.name || !selectedBrand) {
      showToast('الرجاء إدخال اسم الموديل واختيار الماركة', 'warning');
      return;
    }
    
    await db.models.add({
      brandId: selectedBrand,
      name: modelForm.name,
      nameAr: modelForm.nameAr,
      category: modelForm.category,
      description: modelForm.description,
      isActive: true,
    });
    
    showToast('تمت إضافة الموديل بنجاح', 'success');
    setShowModelModal(false);
    setModelForm({ name: '', nameAr: '', category: '', description: '' });
    loadModels(selectedBrand);
  };

  const saveVariant = async () => {
    if (!variantForm.color || !variantForm.size || !selectedModel) {
      showToast('الرجاء إدخال اللون والمقاس', 'warning');
      return;
    }
    
    const sku = variantForm.sku || `SKU-${Date.now()}`;
    
    await db.variants.add({
      modelId: selectedModel,
      color: variantForm.color,
      colorAr: variantForm.colorAr,
      size: variantForm.size,
      sku,
      barcode: variantForm.barcode,
      salePrice: parseFloat(variantForm.salePrice) || 0,
      costPrice: parseFloat(variantForm.costPrice) || 0,
      isActive: true,
    });
    
    showToast('تمت إضافة المتغير بنجاح', 'success');
    setShowVariantModal(false);
    setVariantForm({
      color: '', colorAr: '', size: '', sku: '', barcode: '',
      salePrice: '', costPrice: ''
    });
    loadVariants(selectedModel);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">
          إدارة المنتجات
        </h1>
        <Button onClick={() => setShowBrandModal(true)}>
          <Plus size={18} className="ml-2" />
          ماركة جديدة
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Brands */}
        <Card>
          <CardHeader 
            title="الماركات" 
            action={
              <Button size="sm" onClick={() => setShowBrandModal(true)}>
                <Plus size={16} />
              </Button>
            }
          />
          <div className="space-y-2">
            {brands.map((brand) => (
              <button
                key={brand.id}
                onClick={() => {
                  setSelectedBrand(brand.id!);
                  setSelectedModel(null);
                }}
                className={`w-full px-4 py-3 rounded-lg text-right transition-all duration-200 ${
                  selectedBrand === brand.id
                    ? 'bg-primary-100 text-primary-700 shadow-sm'
                    : 'hover:bg-slate-100'
                }`}
              >
                {brand.nameAr || brand.name}
              </button>
            ))}
            {brands.length === 0 && (
              <p className="text-center text-slate-400 py-4">
                لا توجد ماركات
              </p>
            )}
          </div>
        </Card>

        {/* Models */}
        <Card>
          <CardHeader 
            title="الموديلات"
            action={
              selectedBrand && (
                <Button size="sm" onClick={() => setShowModelModal(true)}>
                  <Plus size={16} />
                </Button>
              )
            }
          />
          <div className="space-y-2">
            {models.map((model) => (
              <button
                key={model.id}
                onClick={() => setSelectedModel(model.id!)}
                className={`w-full px-4 py-3 rounded-lg text-right transition-all duration-200 ${
                  selectedModel === model.id
                    ? 'bg-primary-100 text-primary-700 shadow-sm'
                    : 'hover:bg-slate-100'
                }`}
              >
                <p className="font-medium">{model.nameAr || model.name}</p>
                {model.category && (
                  <p className="text-sm text-slate-500">{model.category}</p>
                )}
              </button>
            ))}
            {selectedBrand && models.length === 0 && (
              <p className="text-center text-slate-400 py-4">
                لا توجد موديلات
              </p>
            )}
            {!selectedBrand && (
              <p className="text-center text-slate-400 py-4">
                اختر ماركة أولاً
              </p>
            )}
          </div>
        </Card>

        {/* Variants */}
        <Card>
          <CardHeader 
            title="المتغيرات (لون + مقاس)"
            action={
              selectedModel && (
                <Button size="sm" onClick={() => setShowVariantModal(true)}>
                  <Plus size={16} />
                </Button>
              )
            }
          />
          <div className="space-y-2">
            {variants.map((variant) => (
              <div
                key={variant.id}
                className="px-4 py-3 bg-slate-50 rounded-lg"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">
                      {variant.colorAr || variant.color} - {variant.size}
                    </p>
                    <p className="text-sm text-slate-500">{variant.sku}</p>
                  </div>
                  <p className="font-bold text-primary-600">
                    {variant.salePrice.toFixed(2)} ر.س
                  </p>
                </div>
              </div>
            ))}
            {selectedModel && variants.length === 0 && (
              <p className="text-center text-slate-400 py-4">
                لا توجد متغيرات
              </p>
            )}
            {!selectedModel && (
              <p className="text-center text-slate-400 py-4">
                اختر موديل أولاً
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Brand Modal */}
      <Modal
        isOpen={showBrandModal}
        onClose={() => setShowBrandModal(false)}
        title="إضافة ماركة جديدة"
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="اسم الماركة (إنجليزي)"
            value={brandForm.name}
            onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
            placeholder="Nike"
          />
          <Input
            label="اسم الماركة (عربي)"
            value={brandForm.nameAr}
            onChange={(e) => setBrandForm({ ...brandForm, nameAr: e.target.value })}
            placeholder="نايك"
          />
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setShowBrandModal(false)}>
              إلغاء
            </Button>
            <Button className="flex-1" onClick={saveBrand}>
              حفظ
            </Button>
          </div>
        </div>
      </Modal>

      {/* Model Modal */}
      <Modal
        isOpen={showModelModal}
        onClose={() => setShowModelModal(false)}
        title="إضافة موديل جديد"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="اسم الموديل (إنجليزي)"
            value={modelForm.name}
            onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
            placeholder="Air Max"
          />
          <Input
            label="اسم الموديل (عربي)"
            value={modelForm.nameAr}
            onChange={(e) => setModelForm({ ...modelForm, nameAr: e.target.value })}
            placeholder="اير ماكس"
          />
          <Input
            label="الفئة"
            value={modelForm.category}
            onChange={(e) => setModelForm({ ...modelForm, category: e.target.value })}
            placeholder="رياضي / رسمي / كاجوال"
          />
          <Input
            label="الوصف"
            value={modelForm.description}
            onChange={(e) => setModelForm({ ...modelForm, description: e.target.value })}
            placeholder="وصف اختياري"
          />
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setShowModelModal(false)}>
              إلغاء
            </Button>
            <Button className="flex-1" onClick={saveModel}>
              حفظ
            </Button>
          </div>
        </div>
      </Modal>

      {/* Variant Modal */}
      <Modal
        isOpen={showVariantModal}
        onClose={() => setShowVariantModal(false)}
        title="إضافة متغير جديد"
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="اللون (إنجليزي)"
              value={variantForm.color}
              onChange={(e) => setVariantForm({ ...variantForm, color: e.target.value })}
              placeholder="Black"
            />
            <Input
              label="اللون (عربي)"
              value={variantForm.colorAr}
              onChange={(e) => setVariantForm({ ...variantForm, colorAr: e.target.value })}
              placeholder="أسود"
            />
          </div>
          <Input
            label="المقاس"
            value={variantForm.size}
            onChange={(e) => setVariantForm({ ...variantForm, size: e.target.value })}
            placeholder="42"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="SKU"
              value={variantForm.sku}
              onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value })}
              placeholder="تلقائي"
            />
            <Input
              label="الباركود"
              value={variantForm.barcode}
              onChange={(e) => setVariantForm({ ...variantForm, barcode: e.target.value })}
              placeholder="اختياري"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="سعر البيع"
              type="number"
              value={variantForm.salePrice}
              onChange={(e) => setVariantForm({ ...variantForm, salePrice: e.target.value })}
              placeholder="0.00"
            />
            <Input
              label="سعر التكلفة"
              type="number"
              value={variantForm.costPrice}
              onChange={(e) => setVariantForm({ ...variantForm, costPrice: e.target.value })}
              placeholder="0.00"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setShowVariantModal(false)}>
              إلغاء
            </Button>
            <Button className="flex-1" onClick={saveVariant}>
              حفظ
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
