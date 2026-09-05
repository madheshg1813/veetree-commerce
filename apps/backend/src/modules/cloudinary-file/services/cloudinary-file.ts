import { AbstractFileProviderService, MedusaError } from "@medusajs/framework/utils"
import type {
  ProviderDeleteFileDTO,
  ProviderFileResultDTO,
  ProviderGetFileDTO,
  ProviderUploadFileDTO,
} from "@medusajs/framework/types"
import { Readable } from "stream"
import { v2 as cloudinary } from "cloudinary"

type Options = {
  cloudName?: string
  apiKey?: string
  apiSecret?: string
  /** Everything is uploaded beneath this folder, e.g. "veetree". */
  folder?: string
}

/**
 * Cloudinary file storage for the Medusa dashboard.
 *
 * Railway's filesystem is ephemeral: with the default local provider, every
 * image uploaded through the dashboard would disappear on the next deploy.
 * Cloudinary is already where the storefront's photography lives, so uploads
 * go to the same place, and the storefront's image loader resizes them for
 * free — a dashboard upload gets the same responsive treatment as any other
 * product image.
 */
class CloudinaryFileProviderService extends AbstractFileProviderService {
  static identifier = "cloudinary"

  private readonly folder: string

  constructor(_: unknown, options: Options) {
    super()

    const cloudName = options.cloudName?.trim()
    const apiKey = options.apiKey?.trim()
    const apiSecret = options.apiSecret?.trim()

    if (!cloudName || !apiKey || !apiSecret) {
      throw new MedusaError(
        MedusaError.Types.INVALID_ARGUMENT,
        "Cloudinary file provider needs cloudName, apiKey and apiSecret."
      )
    }

    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true })
    this.folder = options.folder?.trim() || "veetree"
  }

  async upload(file: ProviderUploadFileDTO): Promise<ProviderFileResultDTO> {
    if (!file?.content) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "No file content to upload.")
    }

    // Medusa hands over base64; Cloudinary accepts a data URI directly, which
    // avoids writing a temp file to a disk we do not want to depend on.
    const dataUri = `data:${file.mimeType};base64,${file.content}`
    // Keep the original name as the public id, minus its extension —
    // Cloudinary appends the right one per delivered format.
    const stem = file.filename.replace(/\.[^./]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "-")

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: `${this.folder}/uploads`,
      public_id: stem || undefined,
      // A re-upload of the same name replaces the image rather than silently
      // creating "name_1"; invalidate clears it from the CDN edge too.
      overwrite: true,
      invalidate: true,
      resource_type: "auto",
    })

    return { url: result.secure_url, key: result.public_id }
  }

  async delete(files: ProviderDeleteFileDTO | ProviderDeleteFileDTO[]): Promise<void> {
    for (const file of Array.isArray(files) ? files : [files]) {
      if (!file?.fileKey) continue
      await cloudinary.uploader.destroy(file.fileKey, { invalidate: true })
    }
  }

  /**
   * Uploads are public, so the delivery URL is the download URL — there is no
   * signed variant to hand back.
   */
  async getPresignedDownloadUrl(file: ProviderGetFileDTO): Promise<string> {
    if (!file?.fileKey) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "No file key given.")
    }
    return cloudinary.url(file.fileKey, { secure: true })
  }

  async getDownloadStream(file: ProviderGetFileDTO): Promise<Readable> {
    const res = await fetch(cloudinary.url(file.fileKey, { secure: true }))
    if (!res.ok || !res.body) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Could not read ${file.fileKey}.`)
    }
    return Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
  }

  async getAsBuffer(file: ProviderGetFileDTO): Promise<Buffer> {
    const res = await fetch(cloudinary.url(file.fileKey, { secure: true }))
    if (!res.ok) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Could not read ${file.fileKey}.`)
    }
    return Buffer.from(await res.arrayBuffer())
  }
}

export default CloudinaryFileProviderService
