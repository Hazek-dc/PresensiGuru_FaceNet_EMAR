<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Foto profil guru. Disimpan di disk privat dan hanya disajikan lewat rute admin;
 * foto ini untuk tampilan dan tidak dipakai mesin verifikasi wajah.
 */
class TeacherAvatarController extends Controller
{
    private const DISK = 'local';

    public const MAX_KB = 2048;

    public function show(string $teacher): StreamedResponse
    {
        $user = User::withTrashed()->findOrFail($teacher);
        abort_unless($user->avatar_path && Storage::disk(self::DISK)->exists($user->avatar_path), 404);

        return Storage::disk(self::DISK)->response($user->avatar_path, null, [
            'Cache-Control' => 'private, max-age=86400',
        ]);
    }

    public function store(Request $request, string $teacher): RedirectResponse
    {
        $user = User::withTrashed()->findOrFail($teacher);

        $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:'.self::MAX_KB, 'dimensions:min_width=96,min_height=96'],
        ], [
            'avatar.required' => 'Pilih foto terlebih dahulu.',
            'avatar.image' => 'Berkas harus berupa gambar.',
            'avatar.mimes' => 'Format foto harus JPG, PNG, atau WebP.',
            'avatar.max' => 'Ukuran foto paling besar 2 MB.',
            'avatar.dimensions' => 'Foto minimal 96 × 96 piksel.',
        ]);

        if ($user->trashed()) {
            throw ValidationException::withMessages(['avatar' => 'Guru nonaktif tidak bisa diberi foto baru. Aktifkan kembali dulu.']);
        }

        $old = $user->avatar_path;
        $user->forceFill(['avatar_path' => $request->file('avatar')->store('avatars', self::DISK)])->save();
        if ($old) {
            Storage::disk(self::DISK)->delete($old);
        }

        activity()->performedOn($user)->causedBy($request->user())->log('updated_teacher_avatar');

        return back()->with('success', 'Foto profil diperbarui.');
    }

    public function destroy(Request $request, string $teacher): RedirectResponse
    {
        $user = User::withTrashed()->findOrFail($teacher);

        if ($user->avatar_path) {
            Storage::disk(self::DISK)->delete($user->avatar_path);
            $user->forceFill(['avatar_path' => null])->save();
            activity()->performedOn($user)->causedBy($request->user())->log('removed_teacher_avatar');
        }

        return back()->with('success', 'Foto profil dihapus.');
    }
}
