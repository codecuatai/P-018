import { useState, useCallback, useEffect } from 'react';
import {
  listAddresses,
  createAddress,
  deleteAddress,
  type SavedAddress,
  type SavedAddressInput,
} from '../api/addresses';

export function useAddresses() {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listAddresses();
      setAddresses(result.items);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể tải danh sách địa chỉ.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addAddress = useCallback(async (input: SavedAddressInput): Promise<boolean> => {
    setSaving(true);
    try {
      const created = await createAddress(input);
      setAddresses((prev: SavedAddress[]) => [...prev, created]);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể lưu địa chỉ.';
      setError(message);
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const removeAddress = useCallback(async (id: string): Promise<boolean> => {
    try {
      await deleteAddress(id);
      setAddresses((prev: SavedAddress[]) => prev.filter((a: SavedAddress) => a.id !== id));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể xóa địa chỉ.';
      setError(message);
      return false;
    }
  }, []);

  return {
    addresses,
    loading,
    error,
    saving,
    refresh,
    addAddress,
    removeAddress,
  };
}
