import { assetUrl } from "../lib/api";
import { resolveShopTheme } from "../themes";

interface ShopAvatarProps {
  shop: { name: string; theme_id: string; theme_custom: string | null; logo_url: string | null };
  size?: number;
  className?: string;
}

// يعرض شعار المحل الفعلي (الهوية التجارية) إن وُجد، وإلا حرف الاسم الأول
// بألوان القالب/التخصيص — يُستخدم في لوحة المالك وواجهة الموظف.
export function ShopAvatar({ shop, size = 40, className = "" }: ShopAvatarProps) {
  const theme = resolveShopTheme(shop);
  const logo = assetUrl(shop.logo_url);
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl font-extrabold text-white ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
      }}
    >
      {logo ? (
        <img src={logo} alt={shop.name} className="h-full w-full object-cover" />
      ) : (
        shop.name.charAt(0)
      )}
    </div>
  );
}
