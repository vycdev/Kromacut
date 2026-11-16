use serde::Serialize;
use std::io::Read;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct ImageFile {
    name: String,
    mime: String,
    bytes: Vec<u8>,
}

fn local_path(input: &str) -> Result<PathBuf, String> {
    let path = input.trim().trim_matches('"');
    let bytes = path.as_bytes();
    if bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
    {
        #[cfg(target_os = "windows")]
        return Ok(PathBuf::from(path));
        #[cfg(not(target_os = "windows"))]
        return Ok(PathBuf::from(format!(
            "/mnt/{}/{}",
            (bytes[0] as char).to_ascii_lowercase(),
            path[3..].replace('\\', "/")
        )));
    }
    if path.starts_with('/') {
        return Ok(PathBuf::from(path));
    }
    Err("Use an absolute Windows drive path or a /mnt/ path. Network shares must be mounted in WSL first.".into())
}

#[tauri::command]
pub async fn read_image_path(path: String) -> Result<ImageFile, String> {
    let path = local_path(&path)?;
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        _ => return Err("Choose a PNG, JPEG, WebP, GIF or BMP image.".into()),
    };
    let file = std::fs::File::open(&path)
        .map_err(|e| format!("Cannot open image: {e}. Check that the drive is mounted in WSL."))?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    let limit = 64 * 1024 * 1024;
    if !metadata.is_file() || metadata.len() > limit {
        return Err("Choose an image file smaller than 64 MB.".into());
    }
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit {
        return Err("Image exceeds 64 MB.".into());
    }
    Ok(ImageFile {
        name: path.file_name().unwrap().to_string_lossy().into_owned(),
        mime: mime.into(),
        bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_and_linux_paths() {
        #[cfg(not(target_os = "windows"))]
        assert_eq!(
            local_path(r#" "C:\Users\Test Name\a.png" "#).unwrap(),
            PathBuf::from("/mnt/c/Users/Test Name/a.png")
        );
        #[cfg(not(target_os = "windows"))]
        assert_eq!(
            local_path("S:/jsm/picture.png").unwrap(),
            PathBuf::from("/mnt/s/jsm/picture.png")
        );
        assert_eq!(
            local_path("/mnt/r/a.png").unwrap(),
            PathBuf::from("/mnt/r/a.png")
        );
        #[cfg(target_os = "windows")]
        assert_eq!(
            local_path(r"C:\Pictures\a.png").unwrap(),
            PathBuf::from(r"C:\Pictures\a.png")
        );
        assert!(local_path("../secret.png").is_err());
        assert!(local_path(r"\\server\share\a.png").is_err());
    }
}
