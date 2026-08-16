/*
 * MaxSui Blog API
 *
 * Runtime:
 *   Cloudflare Workers
 *
 * Bindings:
 *   DB = D1 database
 *
 * Environment variables:
 *   FRONTEND_ORIGIN
 *   HUANG1111_BASE_URL
 *   HUANG1111_ROOT
 *
 * Secrets:
 *   SESSION_SECRET
 *   HUANG1111_USERNAME
 *   HUANG1111_PASSWORD
 *   ADMIN_BOOTSTRAP_TOKEN
 */

const PBKDF2_ITERATIONS = 100000;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_ARTICLE_LENGTH = 2_000_000;
const MAX_TITLE_LENGTH = 200;
const MAX_SLUG_LENGTH = 200;
const MAX_EXCERPT_LENGTH = 1000;
const MAX_FILE_SIZE = 100 * 1024 * 1024;

const ALLOWED_FILE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "application/pdf",
    "application/zip",
    "application/x-zip-compressed",
    "application/octet-stream",
    "text/plain",
    "text/markdown"
]);


// ============================================================
// Main
// ============================================================

export default {
    async fetch(request, env) {
        try {
            return await handleRequest(request, env);
        } catch (error) {
            console.error("Unhandled error:", error);

            return json({
                success: false,
                error: "Internal server error"
            }, 500, request, env);
        }
    }
};


// ============================================================
// Router
// ============================================================

async function handleRequest(request, env) {
    const url = new URL(request.url);
    const method = request.method;
    const path = normalizePath(url.pathname);

    // CORS preflight
    if (method === "OPTIONS") {
        return corsPreflight(request, env);
    }

    // --------------------------------------------------------
    // Public
    // --------------------------------------------------------

    if (method === "GET" && path === "/api/health") {
        return json({
            success: true,
            service: "maxsui-api",
            status: "ok"
        }, 200, request, env);
    }

    if (method === "GET" && path === "/api/profile") {
        return getProfile(request, env);
    }

    if (method === "GET" && path === "/api/articles") {
        return getArticles(request, env);
    }

    if (
        method === "GET" &&
        path.startsWith("/api/articles/")
    ) {
        const slug = decodeURIComponent(
            path.substring("/api/articles/".length)
        );

        return getArticle(slug, request, env);
    }

    if (
        method === "GET" &&
        path === "/api/categories"
    ) {
        return getCategories(request, env);
    }

    // --------------------------------------------------------
    // Authentication
    // --------------------------------------------------------

    if (
        method === "POST" &&
        path === "/api/auth/login"
    ) {
        return login(request, env);
    }

    if (
        method === "POST" &&
        path === "/api/auth/logout"
    ) {
        return logout(request, env);
    }

    if (
        method === "GET" &&
        path === "/api/auth/me"
    ) {
        return currentUser(request, env);
    }

    // --------------------------------------------------------
    // Admin profile
    // --------------------------------------------------------

    if (
        method === "PUT" &&
        path === "/api/admin/profile/status"
    ) {
        return withAdmin(request, env, async () => {
            return updateProfileStatus(request, env);
        });
    }

    // --------------------------------------------------------
    // Admin articles
    // --------------------------------------------------------

    if (
        method === "POST" &&
        path === "/api/admin/articles"
    ) {
        return withAdmin(request, env, async (admin) => {
            return createArticle(
                request,
                env,
                admin
            );
        });
    }

    if (
        method === "PUT" &&
        /^\/api\/admin\/articles\/\d+$/.test(path)
    ) {
        const id = Number(
            path.substring(
                "/api/admin/articles/".length
            )
        );

        return withAdmin(request, env, async (admin) => {
            return updateArticle(
                request,
                env,
                admin,
                id
            );
        });
    }

    if (
        method === "DELETE" &&
        /^\/api\/admin\/articles\/\d+$/.test(path)
    ) {
        const id = Number(
            path.substring(
                "/api/admin/articles/".length
            )
        );

        return withAdmin(request, env, async (admin) => {
            return deleteArticle(
                request,
                env,
                admin,
                id
            );
        });
    }

    // --------------------------------------------------------
    // Admin files
    // --------------------------------------------------------

    if (
        method === "GET" &&
        path === "/api/admin/files"
    ) {
        return withAdmin(request, env, async () => {
            return listFiles(request, env);
        });
    }

    if (
        method === "POST" &&
        path === "/api/admin/files"
    ) {
        return withAdmin(request, env, async () => {
            return uploadFile(request, env);
        });
    }

    if (
        method === "DELETE" &&
        /^\/api\/admin\/files\/\d+$/.test(path)
    ) {
        const id = Number(
            path.substring(
                "/api/admin/files/".length
            )
        );

        return withAdmin(request, env, async () => {
            return deleteFile(
                request,
                env,
                id
            );
        });
    }

    // --------------------------------------------------------
    // Public file information
    // --------------------------------------------------------

    if (
        method === "GET" &&
        /^\/api\/files\/\d+$/.test(path)
    ) {
        const id = Number(
            path.substring(
                "/api/files/".length
            )
        );

        return getFile(
            request,
            env,
            id
        );
    }

    return json({
        success: false,
        error: "Not Found"
    }, 404, request, env);
}


// ============================================================
// Profile API
// ============================================================

async function getProfile(request, env) {
    const profile = await env.DB.prepare(`
        SELECT
            id,
            status_type,
            status_text,
            updated_at
        FROM site_profile
        WHERE id = 1
        LIMIT 1
    `).first();

    if (!profile) {
        return json({
            success: false,
            error: "Profile not found"
        }, 404, request, env);
    }

    return json({
        success: true,
        profile
    }, 200, request, env);
}


async function updateProfileStatus(request, env) {
    const body = await readJson(
        request,
        5000
    );

    const statusType =
        String(body.status_type || "")
            .trim()
            .toLowerCase();

    const statusText =
        String(body.status_text || "")
            .trim();

    const allowedStatuses = new Set([
        "online",
        "busy",
        "away",
        "dnd",
        "invisible",
        "offline",
        "custom"
    ]);

    if (!allowedStatuses.has(statusType)) {
        return json({
            success: false,
            error: "Invalid status type"
        }, 400, request, env);
    }

    if (
        !statusText ||
        statusText.length > 50
    ) {
        return json({
            success: false,
            error: "Invalid status text"
        }, 400, request, env);
    }

    const now =
        new Date().toISOString();

    await env.DB.prepare(`
        INSERT INTO site_profile (
            id,
            status_type,
            status_text,
            updated_at
        )
        VALUES (1, ?, ?, ?)
        ON CONFLICT(id)
        DO UPDATE SET
            status_type = excluded.status_type,
            status_text = excluded.status_text,
            updated_at = excluded.updated_at
    `)
        .bind(
            statusType,
            statusText,
            now
        )
        .run();

    return json({
        success: true,
        profile: {
            id: 1,
            status_type: statusType,
            status_text: statusText,
            updated_at: now
        }
    }, 200, request, env);
}


// ============================================================
// Article API
// ============================================================

async function getArticles(request, env) {
    const url = new URL(request.url);

    const page = Math.max(
        1,
        Number(url.searchParams.get("page") || "1")
    );

    const limit = Math.min(
        50,
        Math.max(
            1,
            Number(
                url.searchParams.get("limit") || "10"
            )
        )
    );

    const offset = (page - 1) * limit;

    const search =
        url.searchParams.get("search")?.trim() || "";

    let result;

    if (search) {
        const pattern = `%${search}%`;

        result = await env.DB.prepare(`
            SELECT
                id,
                title,
                slug,
                excerpt,
                cover,
                category,
                reading_time,
                created_at,
                published_at
            FROM articles
            WHERE status = 'published'
              AND (
                    title LIKE ?
                    OR excerpt LIKE ?
              )
            ORDER BY published_at DESC
            LIMIT ? OFFSET ?
        `)
            .bind(
                pattern,
                pattern,
                limit,
                offset
            )
            .all();
    } else {
        result = await env.DB.prepare(`
            SELECT
                id,
                title,
                slug,
                excerpt,
                cover,
                category,
                reading_time,
                created_at,
                published_at
            FROM articles
            WHERE status = 'published'
            ORDER BY published_at DESC
            LIMIT ? OFFSET ?
        `)
            .bind(
                limit,
                offset
            )
            .all();
    }

    return json({
        success: true,
        page,
        limit,
        articles: result.results
    }, 200, request, env);
}


async function getArticle(slug, request, env) {
    if (!slug || slug.length > MAX_SLUG_LENGTH) {
        return json({
            success: false,
            error: "Invalid slug"
        }, 400, request, env);
    }

    const article = await env.DB.prepare(`
        SELECT
            id,
            title,
            slug,
            content,
            content_format,
            excerpt,
            cover,
            category,
            reading_time,
            created_at,
            updated_at,
            published_at
        FROM articles
        WHERE slug = ?
          AND status = 'published'
        LIMIT 1
    `)
        .bind(slug)
        .first();

    if (!article) {
        return json({
            success: false,
            error: "Article not found"
        }, 404, request, env);
    }

    return json({
        success: true,
        article
    }, 200, request, env);
}


async function createArticle(request, env) {
    const body = await readJson(
        request,
        MAX_ARTICLE_LENGTH + 5000
    );

    const title = String(
        body.title || ""
    ).trim();

    const slug = String(
        body.slug || ""
    ).trim();

    const content = String(
        body.content || ""
    );

    const excerpt = String(
        body.excerpt || ""
    ).trim();

    const cover = body.cover
        ? String(body.cover).trim()
        : null;

    const category = body.category
        ? String(body.category).trim()
        : null;

    const status = normalizeStatus(
        body.status
    );

    if (!title || title.length > MAX_TITLE_LENGTH) {
        return json({
            success: false,
            error: "Invalid title"
        }, 400, request, env);
    }

    if (
        !slug ||
        slug.length > MAX_SLUG_LENGTH ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(slug)
    ) {
        return json({
            success: false,
            error: "Invalid slug"
        }, 400, request, env);
    }

    if (
        !content ||
        content.length > MAX_ARTICLE_LENGTH
    ) {
        return json({
            success: false,
            error: "Invalid article content"
        }, 400, request, env);
    }

    if (excerpt.length > MAX_EXCERPT_LENGTH) {
        return json({
            success: false,
            error: "Excerpt is too long"
        }, 400, request, env);
    }

    const now = new Date().toISOString();

    const readingTime =
        calculateReadingTime(content);

    const publishedAt =
        status === "published"
            ? now
            : null;

    try {
        const result = await env.DB.prepare(`
            INSERT INTO articles (
                title,
                slug,
                content,
                content_format,
                excerpt,
                cover,
                category,
                status,
                reading_time,
                created_at,
                updated_at,
                published_at
            )
            VALUES (?, ?, ?, 'markdown', ?, ?, ?, ?, ?, ?, ?, ?)
        `)
            .bind(
                title,
                slug,
                content,
                excerpt || null,
                cover,
                category,
                status,
                readingTime,
                now,
                now,
                publishedAt
            )
            .run();

        return json({
            success: true,
            article_id: result.meta.last_row_id
        }, 201, request, env);

    } catch (error) {
        console.error(
            "Create article error:",
            error
        );

        if (
            String(error.message)
                .toLowerCase()
                .includes("unique")
        ) {
            return json({
                success: false,
                error: "Slug already exists"
            }, 409, request, env);
        }

        throw error;
    }
}


async function updateArticle(
    request,
    env,
    admin,
    id
) {
    const body = await readJson(
        request,
        MAX_ARTICLE_LENGTH + 5000
    );

    const oldArticle = await env.DB.prepare(`
        SELECT *
        FROM articles
        WHERE id = ?
        LIMIT 1
    `)
        .bind(id)
        .first();

    if (!oldArticle) {
        return json({
            success: false,
            error: "Article not found"
        }, 404, request, env);
    }

    const title =
        body.title !== undefined
            ? String(body.title).trim()
            : oldArticle.title;

    const slug =
        body.slug !== undefined
            ? String(body.slug).trim()
            : oldArticle.slug;

    const content =
        body.content !== undefined
            ? String(body.content)
            : oldArticle.content;

    const excerpt =
        body.excerpt !== undefined
            ? String(body.excerpt).trim()
            : oldArticle.excerpt;

    const cover =
        body.cover !== undefined
            ? body.cover
                ? String(body.cover).trim()
                : null
            : oldArticle.cover;

    const category =
        body.category !== undefined
            ? body.category
                ? String(body.category).trim()
                : null
            : oldArticle.category;

    const status =
        body.status !== undefined
            ? normalizeStatus(body.status)
            : oldArticle.status;

    if (
        !title ||
        title.length > MAX_TITLE_LENGTH
    ) {
        return json({
            success: false,
            error: "Invalid title"
        }, 400, request, env);
    }

    if (
        !slug ||
        slug.length > MAX_SLUG_LENGTH ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(slug)
    ) {
        return json({
            success: false,
            error: "Invalid slug"
        }, 400, request, env);
    }

    if (
        !content ||
        content.length > MAX_ARTICLE_LENGTH
    ) {
        return json({
            success: false,
            error: "Invalid article content"
        }, 400, request, env);
    }

    const now = new Date().toISOString();

    let publishedAt =
        oldArticle.published_at;

    if (
        status === "published" &&
        !publishedAt
    ) {
        publishedAt = now;
    }

    if (status !== "published") {
        publishedAt = null;
    }

    await env.DB.prepare(`
        UPDATE articles
        SET
            title = ?,
            slug = ?,
            content = ?,
            content_format = 'markdown',
            excerpt = ?,
            cover = ?,
            category = ?,
            status = ?,
            reading_time = ?,
            updated_at = ?,
            published_at = ?
        WHERE id = ?
    `)
        .bind(
            title,
            slug,
            content,
            excerpt || null,
            cover,
            category,
            status,
            calculateReadingTime(content),
            now,
            publishedAt,
            id
        )
        .run();

    return json({
        success: true,
        article_id: id,
        updated_by: admin.username
    }, 200, request, env);
}


async function deleteArticle(
    request,
    env,
    admin,
    id
) {
    const article = await env.DB.prepare(`
        SELECT id
        FROM articles
        WHERE id = ?
        LIMIT 1
    `)
        .bind(id)
        .first();

    if (!article) {
        return json({
            success: false,
            error: "Article not found"
        }, 404, request, env);
    }

    await env.DB.prepare(`
        DELETE FROM articles
        WHERE id = ?
    `)
        .bind(id)
        .run();

    return json({
        success: true
    }, 200, request, env);
}


async function getCategories(request, env) {
    const result = await env.DB.prepare(`
        SELECT
            id,
            name,
            slug
        FROM categories
        ORDER BY name ASC
    `).all();

    return json({
        success: true,
        categories: result.results
    }, 200, request, env);
}


// ============================================================
// Authentication
// ============================================================

async function login(request, env) {
    const body = await readJson(
        request,
        10_000
    );

    const username =
        String(body.username || "").trim();

    const password =
        String(body.password || "");

    if (
        !username ||
        !password ||
        username.length > 100 ||
        password.length > 1000
    ) {
        return json({
            success: false,
            error: "Invalid credentials"
        }, 400, request, env);
    }

    const admin = await env.DB.prepare(`
        SELECT
            id,
            username,
            password_hash,
            enabled
        FROM admins
        WHERE username = ?
        LIMIT 1
    `)
        .bind(username)
        .first();

    if (
        !admin ||
        !admin.enabled ||
        !(await verifyPassword(
            password,
            admin.password_hash
        ))
    ) {
        return json({
            success: false,
            error: "Invalid username or password"
        }, 401, request, env);
    }

    const tokenBytes =
        crypto.getRandomValues(
            new Uint8Array(32)
        );

    const token =
        bytesToBase64Url(tokenBytes);

    const tokenHash =
        await sha256(token);

    const now = new Date();

    const expires =
        new Date(
            now.getTime() +
            SESSION_TTL_SECONDS * 1000
        );

    await env.DB.prepare(`
        INSERT INTO sessions (
            token_hash,
            admin_id,
            expires_at,
            created_at
        )
        VALUES (?, ?, ?, ?)
    `)
        .bind(
            tokenHash,
            admin.id,
            expires.toISOString(),
            now.toISOString()
        )
        .run();

    const headers = new Headers();

    headers.set(
        "Set-Cookie",
        buildSessionCookie(
            token,
            SESSION_TTL_SECONDS
        )
    );

    headers.set(
        "Cache-Control",
        "no-store"
    );

    return jsonWithHeaders({
        success: true,
        admin: {
            id: admin.id,
            username: admin.username
        }
    }, 200, headers, request, env);
}


async function logout(request, env) {
    const token =
        getCookie(
            request.headers.get("Cookie"),
            "session"
        );

    if (token) {
        const tokenHash =
            await sha256(token);

        await env.DB.prepare(`
            DELETE FROM sessions
            WHERE token_hash = ?
        `)
            .bind(tokenHash)
            .run();
    }

    const headers = new Headers();

    headers.set(
        "Set-Cookie",
        buildSessionCookie("", 0)
    );

    headers.set(
        "Cache-Control",
        "no-store"
    );

    return jsonWithHeaders({
        success: true
    }, 200, headers, request, env);
}


async function currentUser(
    request,
    env
) {
    const admin =
        await authenticate(
            request,
            env
        );

    if (!admin) {
        return json({
            success: false,
            authenticated: false
        }, 401, request, env);
    }

    return json({
        success: true,
        authenticated: true,
        admin: {
            id: admin.id,
            username: admin.username
        }
    }, 200, request, env);
}


// ============================================================
// Authentication helpers
// ============================================================

async function authenticate(
    request,
    env
) {
    const token =
        getCookie(
            request.headers.get("Cookie"),
            "session"
        );

    if (!token) {
        return null;
    }

    const tokenHash =
        await sha256(token);

    const admin = await env.DB.prepare(`
        SELECT
            admins.id,
            admins.username,
            admins.enabled,
            sessions.expires_at
        FROM sessions
        INNER JOIN admins
            ON admins.id = sessions.admin_id
        WHERE sessions.token_hash = ?
        LIMIT 1
    `)
        .bind(tokenHash)
        .first();

    if (!admin || !admin.enabled) {
        return null;
    }

    if (
        new Date(admin.expires_at)
            .getTime() <= Date.now()
    ) {
        await env.DB.prepare(`
            DELETE FROM sessions
            WHERE token_hash = ?
        `)
            .bind(tokenHash)
            .run();

        return null;
    }

    return admin;
}


async function withAdmin(
    request,
    env,
    callback
) {
    if (
        !isAllowedOrigin(
            request,
            env
        )
    ) {
        return json({
            success: false,
            error: "Origin not allowed"
        }, 403, request, env);
    }

    const admin =
        await authenticate(
            request,
            env
        );

    if (!admin) {
        return json({
            success: false,
            error: "Authentication required"
        }, 401, request, env);
    }

    return callback(admin);
}


// ============================================================
// Password hashing
// ============================================================

async function hashPassword(password) {
    const salt =
        crypto.getRandomValues(
            new Uint8Array(16)
        );

    const passwordBytes =
        new TextEncoder().encode(password);

    const key =
        await crypto.subtle.importKey(
            "raw",
            passwordBytes,
            {
                name: "PBKDF2"
            },
            false,
            ["deriveBits"]
        );

    const derivedBits =
        await crypto.subtle.deriveBits(
            {
                name: "PBKDF2",
                salt,
                iterations: PBKDF2_ITERATIONS,
                hash: "SHA-256"
            },
            key,
            256
        );

    return [
        "pbkdf2",
        "sha256",
        PBKDF2_ITERATIONS,
        bytesToBase64Url(salt),
        bytesToBase64Url(
            new Uint8Array(derivedBits)
        )
    ].join("$");
}


async function verifyPassword(
    password,
    stored
) {
    try {
        const parts =
            stored.split("$");

        if (
            parts.length !== 5 ||
            parts[0] !== "pbkdf2" ||
            parts[1] !== "sha256"
        ) {
            return false;
        }

        const iterations =
            Number(parts[2]);

        const salt =
            base64UrlToBytes(parts[3]);

        const expected =
            base64UrlToBytes(parts[4]);

        const passwordBytes =
            new TextEncoder().encode(password);

        const key =
            await crypto.subtle.importKey(
                "raw",
                passwordBytes,
                {
                    name: "PBKDF2"
                },
                false,
                ["deriveBits"]
            );

        const derivedBits =
            await crypto.subtle.deriveBits(
                {
                    name: "PBKDF2",
                    salt,
                    iterations,
                    hash: "SHA-256"
                },
                key,
                256
            );

        return constantTimeEqual(
            new Uint8Array(derivedBits),
            expected
        );

    } catch {
        return false;
    }
}


// ============================================================
// Initial administrator
// ============================================================

async function bootstrapAdmin(
    request,
    env
) {
    /*
     * This endpoint is intentionally NOT registered
     * in the main router.
     *
     * If you need it, temporarily add:
     *
     * if (
     *   request.method === "POST" &&
     *   path === "/api/setup/bootstrap"
     * ) {
     *   return bootstrapAdmin(request, env);
     * }
     *
     * After creating the first admin:
     * 1. Delete ADMIN_BOOTSTRAP_TOKEN
     * 2. Remove the route
     * 3. Deploy again
     */

    if (!env.ADMIN_BOOTSTRAP_TOKEN) {
        return json({
            success: false,
            error: "Bootstrap disabled"
        }, 403, request, env);
    }

    const auth =
        request.headers.get(
            "Authorization"
        );

    if (
        !auth ||
        !auth.startsWith("Bearer ")
    ) {
        return json({
            success: false,
            error: "Bootstrap authorization required"
        }, 401, request, env);
    }

    const provided =
        auth.substring(7);

    if (
        !constantTimeStringEqual(
            provided,
            env.ADMIN_BOOTSTRAP_TOKEN
        )
    ) {
        return json({
            success: false,
            error: "Invalid bootstrap token"
        }, 403, request, env);
    }

    const count =
        await env.DB.prepare(`
            SELECT COUNT(*) AS count
            FROM admins
        `).first();

    if (Number(count.count) > 0) {
        return json({
            success: false,
            error: "Administrator already exists"
        }, 409, request, env);
    }

    const body =
        await readJson(
            request,
            10_000
        );

    const username =
        String(body.username || "").trim();

    const password =
        String(body.password || "");

    if (
        !username ||
        username.length > 100 ||
        !password ||
        password.length < 12
    ) {
        return json({
            success: false,
            error:
                "Username is invalid or password is shorter than 12 characters"
        }, 400, request, env);
    }

    const passwordHash =
        await hashPassword(password);

    await env.DB.prepare(`
        INSERT INTO admins (
            username,
            password_hash,
            enabled,
            created_at
        )
        VALUES (?, ?, 1, ?)
    `)
        .bind(
            username,
            passwordHash,
            new Date().toISOString()
        )
        .run();

    return json({
        success: true,
        message:
            "Administrator created. Delete ADMIN_BOOTSTRAP_TOKEN immediately."
    }, 201, request, env);
}


// ============================================================
// Files
// ============================================================

async function listFiles(
    request,
    env
) {
    const result =
        await env.DB.prepare(`
            SELECT
                id,
                filename,
                storage_provider,
                storage_path,
                file_url,
                mime_type,
                size,
                created_at,
                updated_at
            FROM files
            ORDER BY created_at DESC
            LIMIT 200
        `)
            .all();

    return json({
        success: true,
        files: result.results
    }, 200, request, env);
}


async function getFile(
    request,
    env,
    id
) {
    const file =
        await env.DB.prepare(`
            SELECT
                id,
                filename,
                storage_provider,
                file_url,
                mime_type,
                size,
                created_at
            FROM files
            WHERE id = ?
            LIMIT 1
        `)
            .bind(id)
            .first();

    if (!file) {
        return json({
            success: false,
            error: "File not found"
        }, 404, request, env);
    }

    return json({
        success: true,
        file
    }, 200, request, env);
}


async function uploadFile(
    request,
    env
) {
    if (!env.HUANG1111_BASE_URL) {
        return json({
            success: false,
            error: "Huang1111 storage is not configured"
        }, 500, request, env);
    }

    const filename =
        sanitizeFilename(
            getFilenameFromRequest(
                request
            )
        );

    if (!filename) {
        return json({
            success: false,
            error: "Missing filename"
        }, 400, request, env);
    }

    const contentType =
        request.headers.get(
            "Content-Type"
        ) || "application/octet-stream";

    const contentLength =
        Number(
            request.headers.get(
                "Content-Length"
            ) || "0"
        );

    if (
        contentLength &&
        contentLength > MAX_FILE_SIZE
    ) {
        return json({
            success: false,
            error: "File is too large"
        }, 413, request, env);
    }

    if (
        !ALLOWED_FILE_TYPES.has(
            contentType
        )
    ) {
        return json({
            success: false,
            error: "File type is not allowed"
        }, 415, request, env);
    }

    const date =
        new Date()
            .toISOString()
            .slice(0, 10);

    const random =
        bytesToBase64Url(
            crypto.getRandomValues(
                new Uint8Array(8)
            )
        );

    const storagePath =
        joinPath(
            env.HUANG1111_ROOT || "/",
            "blog",
            date,
            `${random}-${filename}`
        );

    const targetUrl =
        buildWebDavUrl(
            env.HUANG1111_BASE_URL,
            storagePath
        );

    const headers =
        buildWebDavAuthHeaders(env);

    headers.set(
        "Content-Type",
        contentType
    );

    const response =
        await fetch(
            targetUrl,
            {
                method: "PUT",
                headers,
                body: request.body
            }
        );

    if (!response.ok) {
        const errorText =
            await safeText(response);

        console.error(
            "WebDAV upload failed:",
            response.status,
            errorText
        );

        return json({
            success: false,
            error: "WebDAV upload failed",
            status: response.status
        }, 502, request, env);
    }

    const now =
        new Date().toISOString();

    const fileUrl =
        targetUrl;

    const result =
        await env.DB.prepare(`
            INSERT INTO files (
                filename,
                storage_provider,
                storage_path,
                file_url,
                mime_type,
                size,
                created_at,
                updated_at
            )
            VALUES (?, 'huang1111', ?, ?, ?, ?, ?, ?)
        `)
            .bind(
                filename,
                storagePath,
                fileUrl,
                contentType,
                contentLength || null,
                now,
                now
            )
            .run();

    return json({
        success: true,
        file: {
            id: result.meta.last_row_id,
            filename,
            url: fileUrl,
            mime_type: contentType,
            size: contentLength || null
        }
    }, 201, request, env);
}


async function deleteFile(
    request,
    env,
    id
) {
    const file =
        await env.DB.prepare(`
            SELECT *
            FROM files
            WHERE id = ?
            LIMIT 1
        `)
            .bind(id)
            .first();

    if (!file) {
        return json({
            success: false,
            error: "File not found"
        }, 404, request, env);
    }

    if (
        file.storage_provider !==
        "huang1111"
    ) {
        return json({
            success: false,
            error: "Unsupported storage provider"
        }, 400, request, env);
    }

    const targetUrl =
        buildWebDavUrl(
            env.HUANG1111_BASE_URL,
            file.storage_path
        );

    const response =
        await fetch(
            targetUrl,
            {
                method: "DELETE",
                headers:
                    buildWebDavAuthHeaders(env)
            }
        );

    if (
        !response.ok &&
        response.status !== 404
    ) {
        console.error(
            "WebDAV delete failed:",
            response.status
        );

        return json({
            success: false,
            error: "WebDAV delete failed"
        }, 502, request, env);
    }

    await env.DB.prepare(`
        DELETE FROM files
        WHERE id = ?
    `)
        .bind(id)
        .run();

    return json({
        success: true
    }, 200, request, env);
}


// ============================================================
// WebDAV
// ============================================================

function buildWebDavAuthHeaders(env) {
    const headers = new Headers();

    if (
        env.HUANG1111_USERNAME &&
        env.HUANG1111_PASSWORD
    ) {
        const credentials =
            `${env.HUANG1111_USERNAME}:${env.HUANG1111_PASSWORD}`;

        headers.set(
            "Authorization",
            `Basic ${btoa(credentials)}`
        );
    }

    return headers;
}


function buildWebDavUrl(
    base,
    path
) {
    const cleanBase =
        String(base)
            .replace(/\/+$/, "");

    const cleanPath =
        "/" +
        String(path || "")
            .replace(/^\/+/, "")
            .split("/")
            .map(
                segment =>
                    encodeURIComponent(
                        segment
                    )
            )
            .join("/");

    return cleanBase + cleanPath;
}


function joinPath(...parts) {
    return parts
        .filter(
            part =>
                part !== undefined &&
                part !== null &&
                String(part).length > 0
        )
        .join("/")
        .replace(/\/+/g, "/")
        .replace(/^([^/])/, "/$1");
}


// ============================================================
// HTTP helpers
// ============================================================

async function readJson(
    request,
    maxBytes
) {
    const contentLength =
        Number(
            request.headers.get(
                "Content-Length"
            ) || "0"
        );

    if (
        contentLength &&
        contentLength > maxBytes
    ) {
        throw new Error(
            "Request body too large"
        );
    }

    const text =
        await request.text();

    if (
        new TextEncoder()
            .encode(text)
            .byteLength > maxBytes
    ) {
        throw new Error(
            "Request body too large"
        );
    }

    try {
        return JSON.parse(text);
    } catch {
        throw new Error(
            "Invalid JSON"
        );
    }
}


function json(
    data,
    status,
    request,
    env
) {
    return jsonWithHeaders(
        data,
        status,
        new Headers(),
        request,
        env
    );
}


function jsonWithHeaders(
    data,
    status,
    headers,
    request,
    env
) {
    headers.set(
        "Content-Type",
        "application/json; charset=utf-8"
    );

    headers.set(
        "X-Content-Type-Options",
        "nosniff"
    );

    headers.set(
        "X-Frame-Options",
        "DENY"
    );

    headers.set(
        "Referrer-Policy",
        "strict-origin-when-cross-origin"
    );

    headers.set(
        "Cache-Control",
        "no-store"
    );

    addCorsHeaders(
        headers,
        request,
        env
    );

    return new Response(
        JSON.stringify(data),
        {
            status,
            headers
        }
    );
}


function corsPreflight(
    request,
    env
) {
    const headers = new Headers();

    addCorsHeaders(
        headers,
        request,
        env
    );

    headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
    );

    headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    headers.set(
        "Access-Control-Allow-Credentials",
        "true"
    );

    headers.set(
        "Access-Control-Max-Age",
        "86400"
    );

    return new Response(
        null,
        {
            status: 204,
            headers
        }
    );
}


function addCorsHeaders(
    headers,
    request,
    env
) {
    const origin =
        request.headers.get(
            "Origin"
        );

    if (
        origin &&
        env.FRONTEND_ORIGIN &&
        origin === env.FRONTEND_ORIGIN
    ) {
        headers.set(
            "Access-Control-Allow-Origin",
            origin
        );

        headers.set(
            "Access-Control-Allow-Credentials",
            "true"
        );

        headers.set(
            "Vary",
            "Origin"
        );
    }
}


function isAllowedOrigin(
    request,
    env
) {
    const origin =
        request.headers.get("Origin");

    if (!origin) {
        return false;
    }

    return (
        origin ===
        env.FRONTEND_ORIGIN
    );
}


// ============================================================
// Cookies
// ============================================================

function buildSessionCookie(
    token,
    maxAge
) {
    return [
        `session=${token}`,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=None",
        `Max-Age=${maxAge}`
    ].join("; ");
}


function getCookie(
    cookieHeader,
    name
) {
    if (!cookieHeader) {
        return null;
    }

    const cookies =
        cookieHeader.split(";");

    for (const cookie of cookies) {
        const index =
            cookie.indexOf("=");

        if (index === -1) {
            continue;
        }

        const key =
            cookie
                .substring(0, index)
                .trim();

        if (key !== name) {
            continue;
        }

        return decodeURIComponent(
            cookie
                .substring(index + 1)
                .trim()
        );
    }

    return null;
}


// ============================================================
// Crypto helpers
// ============================================================

async function sha256(value) {
    const bytes =
        new TextEncoder()
            .encode(value);

    const digest =
        await crypto.subtle.digest(
            "SHA-256",
            bytes
        );

    return bytesToBase64Url(
        new Uint8Array(digest)
    );
}


function constantTimeEqual(
    a,
    b
) {
    if (a.length !== b.length) {
        return false;
    }

    let result = 0;

    for (let i = 0; i < a.length; i++) {
        result |= a[i] ^ b[i];
    }

    return result === 0;
}


function constantTimeStringEqual(
    a,
    b
) {
    const aa =
        new TextEncoder().encode(a);

    const bb =
        new TextEncoder().encode(b);

    return constantTimeEqual(
        aa,
        bb
    );
}


function bytesToBase64Url(bytes) {
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(
            byte
        );
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}


function base64UrlToBytes(value) {
    const base64 =
        value
            .replace(/-/g, "+")
            .replace(/_/g, "/");

    const padded =
        base64 +
        "=".repeat(
            (4 - base64.length % 4) % 4
        );

    const binary =
        atob(padded);

    const bytes =
        new Uint8Array(
            binary.length
        );

    for (
        let i = 0;
        i < binary.length;
        i++
    ) {
        bytes[i] =
            binary.charCodeAt(i);
    }

    return bytes;
}


// ============================================================
// Misc helpers
// ============================================================

function normalizePath(path) {
    if (!path) {
        return "/";
    }

    return (
        "/" +
        path
            .replace(/^\/+/, "")
            .replace(/\/+$/, "")
    );
}


function normalizeStatus(status) {
    const value =
        String(status || "draft")
            .toLowerCase();

    if (
        value === "published" ||
        value === "archived"
    ) {
        return value;
    }

    return "draft";
}


function calculateReadingTime(
    markdown
) {
    const text =
        String(markdown)
            .replace(
                /```[\s\S]*?```/g,
                ""
            )
            .replace(
                /[#>*_`~\[\]\(\)]/g,
                " "
            )
            .trim();

    const chinese =
        (
            text.match(
                /[\u4e00-\u9fff]/g
            ) || []
        ).length;

    const englishWords =
        (
            text.match(
                /\b[A-Za-z0-9]+\b/g
            ) || []
        ).length;

    const minutes =
        Math.ceil(
            (
                chinese / 400 +
                englishWords / 200
            )
        );

    return Math.max(
        1,
        minutes
    );
}


function sanitizeFilename(
    filename
) {
    return String(filename || "")
        .replace(
            /[\\/:*?"<>|]/g,
            "_"
        )
        .replace(
            /\.\./g,
            "_"
        )
        .trim()
        .substring(0, 200);
}


function getFilenameFromRequest(
    request
) {
    const header =
        request.headers.get(
            "X-Filename"
        );

    if (header) {
        return header;
    }

    const disposition =
        request.headers.get(
            "Content-Disposition"
        );

    if (disposition) {
        const match =
            disposition.match(
                /filename="([^"]+)"/i
            );

        if (match) {
            return match[1];
        }
    }

    return "";
}


async function safeText(response) {
    try {
        return await response
            .text()
            .then(
                text =>
                    text.substring(0, 1000)
            );
    } catch {
        return "";
    }
}
