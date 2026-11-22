package dev.gtazz.otw.apkinstaller;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Downloads the new APK into the app's cache and opens Android's installer for it.
 * The person only confirms "Update" there. JS: Capacitor.nativePromise('ApkInstaller',
 * 'downloadAndInstall', { url }), with "progress" events ({ percent }) while downloading.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    private static final int MAX_REDIRECTS = 5;
    private volatile boolean busy = false;

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("Endereço de download inválido.");
            return;
        }
        if (busy) {
            call.reject("O download já está em andamento.");
            return;
        }
        busy = true;
        new Thread(() -> {
            try {
                Context context = getContext();
                File directory = new File(context.getCacheDir(), "apk-update");
                if (!directory.isDirectory() && !directory.mkdirs()) throw new Exception("sem espaço no aparelho");
                File apk = new File(directory, "open-teamwork.apk");
                download(url, apk);

                // The app's own FileProvider (Capacitor template) shares the cache folder.
                Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                call.resolve();
            } catch (Exception error) {
                call.reject("Não foi possível baixar a atualização: " + error.getMessage());
            } finally {
                busy = false;
            }
        }).start();
    }

    private void download(String address, File target) throws Exception {
        HttpURLConnection connection = null;
        try {
            // GitHub answers with a redirect to its file server; followed by hand so
            // a change of host is allowed (only to https).
            for (int redirects = 0; ; redirects++) {
                connection = (HttpURLConnection) new URL(address).openConnection();
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400 && redirects < MAX_REDIRECTS) {
                    String location = connection.getHeaderField("Location");
                    connection.disconnect();
                    if (location == null) throw new Exception("redirecionamento sem destino");
                    address = new URL(new URL(address), location).toString();
                    if (!address.startsWith("https://")) throw new Exception("redirecionamento inseguro");
                    continue;
                }
                if (status != HttpURLConnection.HTTP_OK) throw new Exception("servidor respondeu " + status);
                break;
            }

            long total = connection.getContentLengthLong();
            long received = 0;
            int lastPercent = -1;
            byte[] buffer = new byte[64 * 1024];
            try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(target)) {
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                    received += read;
                    if (total > 0) {
                        int percent = (int) (received * 100 / total);
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            JSObject event = new JSObject();
                            event.put("percent", percent);
                            notifyListeners("progress", event);
                        }
                    }
                }
            }
            if (total > 0 && received != total) throw new Exception("download incompleto");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
