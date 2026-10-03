<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class TeacherDatasetSeeder extends Seeder
{
    /**
     * Run the database seeds for the 18 teachers & staff in the dataset (S01-S18).
     */
    public function run(): void
    {
        $teachers = [
            ['name' => 'Nur Holis, S.Pd', 'email' => 'gurupresensi1@gmail.com', 'embedding_id' => 'S01', 'role' => 'teacher'],
            ['name' => 'Fiki Widiyanti', 'email' => 'gurupresensi2@gmail.com', 'embedding_id' => 'S02', 'role' => 'teacher'],
            ['name' => 'Mauludin, A.Md', 'email' => 'gurupresensi3@gmail.com', 'embedding_id' => 'S03', 'role' => 'teacher'],
            ['name' => 'Kuswari', 'email' => 'gurupresensi4@gmail.com', 'embedding_id' => 'S04', 'role' => 'teacher'],
            ['name' => 'Merliyanti, S.Pd.Gr', 'email' => 'gurupresensi5@gmail.com', 'embedding_id' => 'S05', 'role' => 'teacher'],
            ['name' => 'Karmila', 'email' => 'gurupresensi6@gmail.com', 'embedding_id' => 'S06', 'role' => 'teacher'],
            ['name' => 'Reynaldi Surya Sambas, S.Pd', 'email' => 'gurupresensi7@gmail.com', 'embedding_id' => 'S07', 'role' => 'teacher'],
            ['name' => 'Taufik Hidayat, S.Pd', 'email' => 'gurupresensi8@gmail.com', 'embedding_id' => 'S08', 'role' => 'teacher'],
            ['name' => 'Wery Saputra, S.Pd., Gr', 'email' => 'gurupresensi9@gmail.com', 'embedding_id' => 'S09', 'role' => 'teacher'],
            ['name' => 'Maulidia Dwi Pratiwi', 'email' => 'gurupresensi10@gmail.com', 'embedding_id' => 'S10', 'role' => 'teacher'],
            ['name' => 'Susi Lisnasari, S.Pd', 'email' => 'gurupresensi11@gmail.com', 'embedding_id' => 'S11', 'role' => 'teacher'],
            ['name' => 'Ponco Prasetyo, S.Pd', 'email' => 'gurupresensi12@gmail.com', 'embedding_id' => 'S12', 'role' => 'teacher'],
            ['name' => 'Sinta Yulisma, S.Pd', 'email' => 'gurupresensi13@gmail.com', 'embedding_id' => 'S13', 'role' => 'teacher'],
            ['name' => 'Arie Lazido', 'email' => 'gurupresensi14@gmail.com', 'embedding_id' => 'S14', 'role' => 'teacher'],
            ['name' => 'Bambang Susanto', 'email' => 'gurupresensi15@gmail.com', 'embedding_id' => 'S15', 'role' => 'teacher'],
            ['name' => 'Sri Wahyuni', 'email' => 'gurupresensi16@gmail.com', 'embedding_id' => 'S16', 'role' => 'teacher'],
            ['name' => 'Dedi Irawan', 'email' => 'gurupresensi17@gmail.com', 'embedding_id' => 'S17', 'role' => 'teacher'],
            ['name' => 'Eka Prasetya', 'email' => 'gurupresensi18@gmail.com', 'embedding_id' => 'S18', 'role' => 'teacher'],
        ];

        $defaultPassword = Hash::make('password123');

        // Clean up existing accounts to avoid collisions
        User::where('email', 'like', '%@guru.smk.sch.id')
            ->orWhere('email', 'like', 'gurupresensi%@gmail.com')
            ->orWhereIn('embedding_id', array_column($teachers, 'embedding_id'))
            ->forceDelete();

        foreach ($teachers as $teacher) {
            User::create([
                'name' => $teacher['name'],
                'email' => $teacher['email'],
                'password' => $defaultPassword,
                'role' => $teacher['role'],
                'embedding_id' => $teacher['embedding_id'],
                'is_active' => true,
                'email_verified_at' => now(),
            ]);
        }
    }
}