# Pushing AI Clinic to GitHub

Follow these beginner-friendly steps to upload your project to GitHub safely without uploading unnecessary or sensitive files.

## Step 1: Initialize Git
Open your command prompt or PowerShell and ensure you are in the project folder:
```powershell
cd C:\Users\Dell\Desktop\AI_Clinic
```
Run the following command to initialize a new local Git repository:
```powershell
git init
```

## Step 2: Review the `.gitignore`
Before adding files, notice that a `.gitignore` file has been created for you in this directory. This file tells Git to **ignore** heavy and private files. 
Specifically, it ensures your `venv/` (virtual environment), `clinic.db` (database), and any configuration files are not uploaded, which is exactly what you want!

## Step 3: Add and Commit Your Files
Add all your project files to the staging area:
```powershell
git add .
```
Save (commit) these changes into your local repository with a descriptive message:
```powershell
git commit -m "Initial commit of DocVoice AI Clinic project"
```

## Step 4: Create a Repository on GitHub
1. Go to your [GitHub account](https://github.com/) and create a new repository. 
2. You can name it `AI_Clinic`. 
3. **Important:** Do NOT check any boxes for "Initialize this repository with: Add a README file, Add .gitignore, or Choose a license". Those should be empty so that your repository starts completely blank.

## Step 5: Push your code to GitHub
Once you have created the empty repository, GitHub will provide you with a set of commands under the heading **"…or push an existing repository from the command line"**. They will look like this:

```powershell
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/AI_Clinic.git
git push -u origin main
```

Copy those three lines directly from GitHub, paste them into your PowerShell window, and hit Enter. 

That's it! If you refresh your GitHub page, your code will be safely uploaded and visible online.
