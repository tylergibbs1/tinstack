import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface Portfolio { id: string; arn: string; displayName: string; providerName: string; createdTime: number; }
export interface Product { id: string; arn: string; name: string; owner: string; type: string; }

export class ServiceCatalogService {
  private portfolios: StorageBackend<string, Portfolio>;
  private products: StorageBackend<string, Product>;

  constructor(private accountId: string) {
    this.portfolios = new InMemoryStorage();
    this.products = new InMemoryStorage();
  }

  createPortfolio(displayName: string, providerName: string): Portfolio {
    const id = `port-${crypto.randomUUID().slice(0, 12)}`;
    const p: Portfolio = { id, arn: `arn:aws:catalog:us-east-1:${this.accountId}:portfolio/${id}`, displayName, providerName, createdTime: Date.now() / 1000 };
    this.portfolios.set(id, p);
    return p;
  }

  describePortfolio(id: string): Portfolio {
    const p = this.portfolios.get(id);
    if (!p) throw new AwsError("ResourceNotFoundException", `Portfolio ${id} not found`, 404);
    return p;
  }

  listPortfolios(): Portfolio[] { return this.portfolios.values(); }

  deletePortfolio(id: string): void {
    if (!this.portfolios.has(id)) throw new AwsError("ResourceNotFoundException", `Portfolio ${id} not found`, 404);
    this.portfolios.delete(id);
  }

  createProduct(name: string, owner: string, productType: string): Product {
    const id = `prod-${crypto.randomUUID().slice(0, 12)}`;
    const p: Product = { id, arn: `arn:aws:catalog:us-east-1:${this.accountId}:product/${id}`, name, owner, type: productType ?? "CLOUD_FORMATION_TEMPLATE" };
    this.products.set(id, p);
    return p;
  }

  describeProduct(id: string): Product {
    const p = this.products.get(id);
    if (!p) throw new AwsError("ResourceNotFoundException", `Product ${id} not found`, 404);
    return p;
  }

  searchProducts(): Product[] { return this.products.values(); }
}
