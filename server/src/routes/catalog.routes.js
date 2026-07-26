import { Router } from "express";
import { catalog, catalogLookups, products, productById } from "../controllers/catalog.controller.js";

export const catalogRouter = Router();

catalogRouter.get("/", catalog);
catalogRouter.get("/lookups", catalogLookups);
catalogRouter.get("/products", products);
catalogRouter.get("/products/:id", productById);
